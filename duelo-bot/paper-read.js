export async function carregarPaper(ler, runtime, legado, local) {
  for (const [raizDados, aviso] of [
    [runtime, ''],
    [legado, 'Fonte ao vivo indisponível. Exibindo o último registro no GitHub.'],
    [local, 'Fonte ao vivo indisponível. Exibindo a cópia publicada no site.']
  ]) {
    const url = raizDados + 'results/paper.json';
    try {
      const resultado = await ler(url);
      if (resultado.versao !== 1 || !Number.isFinite(resultado.fim) || !resultado.curva?.length
        || !resultado.metricas?.bot || !resultado.metricas?.hold) throw Error('Resultado paper incompleto');
      return {resultado, url, raizDados, aviso};
    } catch {
      // Cada URL tem seu próprio limite de tempo. Falhas nunca viram um resultado sem aviso.
    }
  }
  throw Error('Nenhuma publicação paper disponível');
}
