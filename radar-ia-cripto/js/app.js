import { buscarMercado, CICLO } from './mercado.js';
import { calcularIndicadores } from './indicadores.js';
import { interpretar } from './leitura.js';
import { estado, grafico, renderizar } from './tela.js';
import { iniciarEventos } from './eventos.js';

const parControle = document.getElementById('par');
const radios = [...document.querySelectorAll('input[name="periodo"]')];
const proxy = document.querySelector('meta[name="bybit-proxy"]').content;
const hora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
// Há no máximo doze seleções. Cada uma guarda a própria leitura e o próximo horário permitido.
const registros = new Map();
let par, periodo, registro, temporizador, ativa;
let ultimoInicio = 0, pausaAte = 0, motivoPausa = '';

function agendar(instante) {
  clearTimeout(temporizador);
  if (!document.hidden) temporizador = setTimeout(atualizar, Math.min(2_147_483_647, Math.max(0, instante - Date.now())));
}

function mostrarEspera(motivo, proxima) {
  const anterior = Boolean(registro.leitura);
  if (!anterior) renderizar(par, periodo, null, 'Candles indisponíveis para esta seleção.');
  estado(anterior ? 'Exibindo dados anteriores' : 'Dados indisponíveis',
    motivo + ' Nova tentativa às ' + hora.format(proxima) + ' UTC.', 'erro');
}

async function atualizar() {
  if (document.hidden || ativa) return;
  const agora = Date.now(), proxima = Math.max(registro.proxima, pausaAte, ultimoInicio + 900);
  if (agora < proxima) {
    if (pausaAte > agora || registro.erro) mostrarEspera(pausaAte > agora ? motivoPausa : registro.erro, proxima);
    else if (registro.leitura) estado('Consulta atualizada', 'Cotação das ' + hora.format(registro.leitura.dados.horaTicker) + ' UTC.', 'ok');
    agendar(proxima);
    return;
  }
  const pedido = new AbortController();
  ativa = pedido;
  ultimoInicio = agora;
  estado(registro.leitura ? 'Atualizando mercado' : 'Carregando mercado',
    registro.leitura ? 'Exibindo a última consulta válida.' : 'Consultando candles e cotação.', 'carregando');
  try {
    const dados = await buscarMercado(par, periodo, { signal: pedido.signal, proxy });
    if (ativa !== pedido) return;
    const ind = calcularIndicadores(dados.candles);
    registro.leitura = { dados, ind, leitura: interpretar(dados.candles, ind) };
    registro.erro = ''; registro.falhas = 0; registro.proxima = agora + CICLO;
    renderizar(par, periodo, registro.leitura);
    estado('Consulta atualizada', 'Cotação das ' + hora.format(dados.horaTicker) + ' UTC.', 'ok');
  } catch (erro) {
    if (ativa !== pedido || pedido.signal.aborted) return;
    registro.falhas++;
    const recuo = Math.min(600_000, CICLO * 2 ** Math.min(4, registro.falhas - 1));
    registro.erro = erro.message || 'A consulta falhou.';
    registro.proxima = Date.now() + Math.max(recuo, erro.pausa || 0);
    if (erro.pausa > 0) { pausaAte = Date.now() + erro.pausa; motivoPausa = registro.erro; }
    mostrarEspera(registro.erro, registro.proxima);
  } finally {
    if (ativa === pedido) { ativa = null; agendar(Math.max(registro.proxima, pausaAte)); }
  }
}

function selecionar() {
  clearTimeout(temporizador);
  ativa?.abort(); ativa = null;
  par = parControle.value; periodo = radios.find(radio => radio.checked).value;
  const chave = par + '/' + periodo;
  if (!registros.has(chave)) registros.set(chave, { leitura: null, proxima: 0, erro: '', falhas: 0 });
  registro = registros.get(chave);
  renderizar(par, periodo, registro.leitura);
  if (document.hidden) {
    estado('Atualização pausada', 'A consulta será retomada ao voltar à aba.', 'pausa');
    return;
  }
  estado('Carregando mercado', 'Verificando a seleção.', 'carregando');
  // Um pequeno atraso agrupa mudanças rápidas de par e período em uma consulta.
  agendar(Date.now() + 220);
}
function trocarMercado() { grafico.focarDia(null); selecionar(); }
parControle.addEventListener('change', trocarMercado);
radios.forEach(radio => radio.addEventListener('change', trocarMercado));
document.addEventListener('visibilitychange', selecionar);
selecionar();
// A pesquisa independe do acesso à bolsa. Só uma escolha explícita leva o leitor ao gráfico.
iniciarEventos(dias => grafico.marcar(dias), data => {
  grafico.focarDia(data);
  if (par !== 'BTCUSDT' || periodo !== 'D') {
    parControle.value = 'BTCUSDT';
    radios.find(r => r.value === 'D').checked = true;
    selecionar();
  }
  document.getElementById('grafico').focus({ preventScroll: true });
  document.getElementById('grafico-titulo').scrollIntoView({ block: 'start' });
});
