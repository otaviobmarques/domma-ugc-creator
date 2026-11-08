/** Texto padrão do termo de uso de imagem e voz — VALIDAR COM O JURÍDICO (decisão em aberto nº 6). */
export function textoTermo(t: { titular: string; finalidade: string; marcas: string[]; canais: string[]; inicio: string; fim: string; usaVoz: boolean }) {
  const canais = t.canais.length ? t.canais.join(", ") : "todos os canais digitais";
  return `TERMO DE AUTORIZAÇÃO DE USO DE IMAGEM${t.usaVoz ? " E VOZ" : ""}

Eu, ${t.titular}, autorizo o uso da minha imagem${t.usaVoz ? " e da minha voz, inclusive sua reprodução sintética por inteligência artificial," : ""}
para a finalidade: ${t.finalidade}.

Marcas autorizadas: ${t.marcas.join(", ")}.
Canais: ${canais}.
Prazo: de ${t.inicio} a ${t.fim}.

Os vídeos serão identificados como "conteúdo gerado por IA". Posso revogar esta autorização a qualquer momento;
a revogação impede novas produções imediatamente, e vídeos já veiculados seguem as regras deste termo.
Meus dados pessoais (foto de rosto e voz) são tratados com base no meu consentimento específico (LGPD, art. 7º, I e art. 11, I)
e serão apagados ao fim do prazo, exceto nos vídeos já aprovados. Posso pedir acesso, correção ou exclusão a qualquer momento.`;
}
