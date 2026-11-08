/**
 * Agente de montagem da Versão Local.
 * Pede à nuvem a próxima montagem, baixa as entradas, roda o FFmpeg no PC
 * e devolve o vídeo em partes. Não tem acesso ao banco: só à API do painel,
 * com a sessão do usuário logado. Node puro (testável sem o Electron).
 */
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const PARTE = 3 * 1024 * 1024;

function criarAgente({ base, fetch, maquina, versao, pasta, log = console.log, aoMudar = () => {} }) {
  const core = require("./dist/core.js");
  let agenteId = null;
  let ocupado = false;
  let parado = false;
  let estado = { conectado: false, usuario: null, trabalhando: null, feitos: 0, erro: null };
  const mudar = (p) => { estado = { ...estado, ...p }; aoMudar(estado); };

  async function api(caminho, opcoes = {}) {
    const r = await fetch(new URL(caminho, base).toString(), {
      method: opcoes.method ?? "POST",
      headers: opcoes.headers ?? { "content-type": "application/json" },
      body: opcoes.body ?? JSON.stringify(opcoes.json ?? {}),
    });
    if (r.status === 401) { const e = new Error("sessão expirada"); e.status = 401; throw e; }
    const texto = await r.text();
    const j = texto ? JSON.parse(texto) : {};
    if (!r.ok) { const e = new Error(j.erro ?? `HTTP ${r.status}`); e.status = r.status; throw e; }
    return j;
  }

  /** Baixa um arquivo em trechos (a rota de mídia entrega até ~3 MB por pedido). */
  async function baixar(url, destino) {
    const out = fs.createWriteStream(destino);
    try {
      let ini = 0;
      for (;;) {
        const r = await fetch(url, { headers: { range: `bytes=${ini}-` } });
        if (!r.ok) throw new Error(`download ${r.status}`);
        const corpo = Buffer.from(await r.arrayBuffer());
        out.write(corpo);
        if (r.status !== 206) break;
        const total = Number((r.headers.get("content-range") ?? "").split("/")[1]);
        ini += corpo.length;
        if (!total || ini >= total || !corpo.length) break;
      }
    } finally {
      await new Promise((res) => out.end(res));
    }
    return destino;
  }

  async function executar(job) {
    const dir = path.join(pasta, job.id);
    await fsp.mkdir(dir, { recursive: true });
    mudar({ trabalhando: `${job.projeto} · variação ${job.variacao}` });
    log(`[agente] montando ${job.projeto} (${job.variacao})`);
    try {
      const fala = await baixar(job.fala, path.join(dir, "fala.mp4"));
      const brolls = [];
      for (let i = 0; i < job.brolls.length; i++) {
        brolls.push({ arquivo: await baixar(job.brolls[i].url, path.join(dir, `broll-${i}.mp4`)), inicio: job.brolls[i].inicio, fim: job.brolls[i].fim });
      }
      const logo = job.logo ? await baixar(job.logo, path.join(dir, "logo.png")) : null;
      const musica = job.musica ? await baixar(job.musica, path.join(dir, "musica.mp3")) : null;
      const saida = path.join(dir, "final.mp4");
      const r = await core.montarArquivos({
        formato: job.formato, qualidade: job.qualidade, roteiro: job.roteiro, fala, brolls, logo, musica,
        marcaIA: job.marcaIA, saida, srtArquivo: path.join(dir, "legendas.srt"),
      });
      const video = await fsp.readFile(saida);
      const partes = Math.ceil(video.length / PARTE);
      for (let n = 0; n < partes; n++) {
        await api(`/api/agente/jobs/${job.id}/parte?n=${n}&agente=${agenteId}`, {
          method: "PUT", headers: { "content-type": "application/octet-stream" }, body: video.subarray(n * PARTE, (n + 1) * PARTE),
        });
      }
      await api(`/api/agente/jobs/${job.id}/concluir`, { json: { agente: agenteId, partes, srt: r.srt, duracao: r.duracao } });
      log(`[agente] concluído (${(video.length / 1048576).toFixed(1)} MB, ${r.duracao.toFixed(1)} s)`);
      mudar({ feitos: estado.feitos + 1, erro: null });
    } catch (e) {
      log(`[agente] falhou: ${e.message}`);
      mudar({ erro: e.message });
      await api(`/api/agente/jobs/${job.id}/falha`, { json: { agente: agenteId, erro: e.message } }).catch(() => {});
    } finally {
      mudar({ trabalhando: null });
      await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async function ciclo() {
    if (ocupado || parado) return;
    ocupado = true;
    try {
      const b = await api("/api/agente/batida", { json: { maquina, versao } });
      agenteId = b.agente;
      mudar({ conectado: true, usuario: b.usuario, workspace: b.workspace });
      if (b.pendentes > 0) {
        const { job } = await api("/api/agente/proximo", { json: { maquina, versao } });
        if (job) await executar(job);
      }
    } catch (e) {
      mudar({ conectado: false, usuario: e.status === 401 ? null : estado.usuario, erro: e.status === 401 ? null : e.message });
    } finally {
      ocupado = false;
    }
  }

  let timer = null;
  return {
    iniciar(intervaloMs = 5000) { parado = false; ciclo(); timer = setInterval(ciclo, intervaloMs); },
    parar() { parado = true; if (timer) clearInterval(timer); },
    ciclo,
    get estado() { return estado; },
  };
}

module.exports = { criarAgente };
