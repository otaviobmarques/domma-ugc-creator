/** Última versão publicada do instalador Windows (GitHub Releases, cache de 10 min). */
export const REPO_DESKTOP = "otaviobmarques/domma-ugc-creator";
export const ARQUIVO_INSTALADOR = "DommaUGCCreator-Setup.exe";

export interface VersaoPC { versao: string; data: string; tamanhoMB: number; url: string }

export async function ultimaVersaoPC(): Promise<VersaoPC | null> {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO_DESKTOP}/releases/latest`, {
      headers: { accept: "application/vnd.github+json" },
      next: { revalidate: 600 },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { tag_name: string; published_at: string; assets: { name: string; size: number; browser_download_url: string }[] };
    const exe = j.assets.find((a) => a.name === ARQUIVO_INSTALADOR);
    return exe ? { versao: j.tag_name.replace(/^v/, ""), data: j.published_at, tamanhoMB: exe.size / 1048576, url: exe.browser_download_url } : null;
  } catch {
    return null;
  }
}
