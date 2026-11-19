export const CATEGORIAS = { ia: 'IA', cripto: 'Cripto', regulacao: 'Regulação', mercado: 'Mercado' };
export const IMPACTOS = { alto: 'Alto', medio: 'Médio', baixo: 'Baixo' };
const DIA = 86_400_000;
const dataBR = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', dateStyle: 'short' });

// Datas editoriais são dias civis. Trabalhar em UTC evita que o leitor no Brasil veja a véspera.
export const diaUTC = ms => new Date(ms).toISOString().slice(0, 10);
export const exibirData = dia => dataBR.format(new Date(dia + 'T00:00:00Z'));
export function validarEventos(lista, corte) {
  if (!Array.isArray(lista)) throw new Error('O arquivo deve conter uma lista.');
  const vistos = new Set();
  for (const e of lista) {
    if (!e || !['date', 'title', 'summary', 'source_name', 'source_url'].every(k => typeof e[k] === 'string' && e[k].trim())) {
      throw new Error('Evento ou fonte incompletos.');
    }
    const ms = Date.parse(e.date + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date) || !Number.isFinite(ms) || diaUTC(ms) !== e.date ||
        e.date < '2026-06-01' || e.date > corte) throw new Error('Data de evento fora da cobertura.');
    if (!Object.hasOwn(CATEGORIAS, e.category) || !Object.hasOwn(IMPACTOS, e.impact)) throw new Error('Classificação inválida.');
    const fonte = new URL(e.source_url);
    if (fonte.protocol !== 'https:' || fonte.username || fonte.password) throw new Error('A fonte deve usar HTTPS.');
    const chave = e.date + '|' + e.title;
    if (vistos.has(chave)) throw new Error('Evento duplicado.');
    vistos.add(chave);
  }
  return [...lista].sort((a, b) => b.date.localeCompare(a.date));
}

export function filtrarEventos(lista, categoria, impacto) {
  return lista.filter(e => (!categoria || e.category === categoria) && (!impacto || e.impact === impacto));
}

// Vários anúncios podem compartilhar o mesmo candle. Um marcador reúne todos os títulos daquele dia.
export function agruparMarcadores(lista) {
  const dias = new Map();
  for (const e of lista) {
    if (e.impact !== 'alto') continue;
    if (!dias.has(e.date)) dias.set(e.date, []);
    dias.get(e.date).push(e.title);
  }
  return dias;
}

function no(tipo, texto, classe) {
  const el = document.createElement(tipo);
  el.textContent = texto;
  if (classe) el.className = classe;
  return el;
}

export function iniciarEventos(aoFiltrar, aoEscolherDia) {
  const id = chave => document.getElementById(chave);
  const categoria = id('categoria'), impacto = id('impacto'), lista = id('eventos-lista');
  const estado = id('eventos-estado'), repetir = id('eventos-repetir');
  let eventos = [];
  function atualizar() {
    const visiveis = filtrarEventos(eventos, categoria.value, impacto.value);
    const itens = document.createDocumentFragment();
    for (const e of visiveis) {
      const item = no('li', ''), data = no('time', exibirData(e.date));
      data.dateTime = e.date;
      const artigo = no('article', ''), etiquetas = no('div', '', 'etiquetas');
      const avaliacao = no('span', 'Impacto ' + IMPACTOS[e.impact].toLowerCase());
      avaliacao.dataset.impacto = e.impact;
      etiquetas.append(no('span', CATEGORIAS[e.category]), avaliacao);
      const fonte = no('a', e.source_name);
      fonte.href = e.source_url; fonte.target = '_blank'; fonte.rel = 'noopener noreferrer';
      const rodape = no('div', '', 'evento-links');
      rodape.append(no('span', 'Fonte'), fonte);
      // O gráfico só tem candles fechados e a API fornece uma janela limitada.
      const idade = Math.floor(Date.now() / DIA) - Date.parse(e.date + 'T00:00:00Z') / DIA;
      if (e.impact === 'alto' && idade > 0 && idade < 300) {
        const botao = no('button', 'Ver no gráfico');
        botao.type = 'button'; botao.setAttribute('aria-label', 'Ver no gráfico: ' + e.title);
        botao.addEventListener('click', () => aoEscolherDia(e.date));
        rodape.append(botao);
      }
      artigo.append(etiquetas, no('h3', e.title), no('p', e.summary), rodape);
      item.append(data, artigo); itens.append(item);
    }
    lista.replaceChildren(itens);
    const total = visiveis.length;
    estado.textContent = total ? total + (total === 1 ? ' evento' : ' eventos') + ' de ' + eventos.length : 'Nenhum evento para estes filtros.';
    aoFiltrar(agruparMarcadores(visiveis));
  }
  // A cronologia é um arquivo do site, lido uma vez e filtrado localmente.
  async function carregar() {
    repetir.hidden = true; categoria.disabled = impacto.disabled = true;
    estado.textContent = 'Carregando eventos…';
    const limite = new AbortController(), prazo = setTimeout(() => limite.abort(), 12_000);
    try {
      const r = await fetch(new URL('../events.json', import.meta.url), { cache: 'no-cache', signal: limite.signal });
      if (!r.ok) throw new Error('Falha de leitura.');
      eventos = validarEventos(await r.json(), id('corte-eventos').dateTime);
      categoria.disabled = impacto.disabled = false;
      atualizar();
    } catch {
      estado.textContent = 'A linha do tempo está indisponível. Tente carregar novamente.';
      repetir.hidden = false;
    } finally { clearTimeout(prazo); }
  }
  categoria.addEventListener('change', atualizar);
  impacto.addEventListener('change', atualizar);
  repetir.addEventListener('click', carregar);
  carregar();
}
