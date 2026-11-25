// Shared by the Astro shell and the retained static pages.
(() => {
  const pt = document.documentElement.lang.toLowerCase().startsWith('pt');
  const t = (en, br) => pt ? br : en;
  const storageKey = 'vertice.telemetry-grid';
  try { document.documentElement.classList.toggle('vl-scan',localStorage.getItem(storageKey)==='1'); } catch {}
  const node = (tag, cls, text) => {
    const el=document.createElement(tag); if(cls) el.className=cls; if(text) el.textContent=text; return el;
  };
  const pill=node('button','vl-key','[⌘K]');
  pill.type='button'; pill.setAttribute('aria-haspopup','dialog');
  pill.setAttribute('aria-keyshortcuts','Control+K Meta+K');
  pill.setAttribute('aria-label',t('Open command palette','Abrir paleta de comandos'));
  const host=document.querySelector('[data-hud-trigger],header nav,body > header');
  if(!host) pill.classList.add('vl-floating');
  (host || document.body).append(pill);

  let dialog, input, list, feedback, active=0, matches=[], previous;
  const diagnostic=document.querySelector('#diagnostic')?'#diagnostic':'/en/ai-ops/#diagnostic';
  const email=document.querySelector('a[href^="mailto:"]')?.getAttribute('href')?.slice(7).split('?')[0]
    || document.querySelector('meta[name="vl-contact-email"]')?.content;
  const commands=[
    [t('Home','Início'),'/'],['AI Ops','/en/ai-ops/'],['Linux Security','/en/linux-security/'],
    [t('Auto Telemetry','Telemetria automotiva'),'/en/auto-telemetry/'],
    [t('Interactive lab','Laboratório interativo'),'/en/lab/'],
    [t('Jump to diagnostic','Ir ao diagnóstico'),diagnostic],
    [t('Copy WhatsApp number','Copiar número do WhatsApp'),async()=>copy('+5541998844684')],
    [email?t('Copy email address','Copiar endereço de e-mail'):t('Copy email draft','Copiar rascunho de e-mail'),
      async()=>copy(email || t('Subject: Engineering diagnostic\n\nI would like to review this diagnostic: ',
                               'Assunto: Diagnóstico técnico\n\nQuero revisar este diagnóstico: ')+location.origin+location.pathname)],
    [t('Toggle telemetry grid / scanlines','Alternar grade de telemetria'),()=>{
      const enabled=document.documentElement.classList.toggle('vl-scan');
      try {localStorage.setItem(storageKey,enabled?'1':'0');} catch {}
      feedback.textContent=enabled?t('Grid enabled','Grade ativada'):t('Grid disabled','Grade desativada');
    }],
  ];
  async function copy(value) {
    try {await navigator.clipboard.writeText(value);feedback.textContent=t('Copied','Copiado');}
    catch {feedback.textContent=t('Clipboard unavailable','Área de transferência indisponível');}
  }
  function select(index) {
    active=index;
    [...list.children].forEach((li,i)=>li.firstChild.setAttribute('aria-selected',String(i===index)));
    if(matches.length) {
      input.setAttribute('aria-activedescendant','vl-option-'+index);
      list.children[index]?.scrollIntoView({block:'nearest'});
    } else input.removeAttribute('aria-activedescendant');
  }
  function render() {
    matches=commands.filter(([name,target])=>(name+' '+(typeof target==='string'?target:'')).toLowerCase().includes(input.value.trim().toLowerCase()));
    list.replaceChildren();feedback.textContent=matches.length?t('↑ ↓ select · Enter run','↑ ↓ selecionar · Enter executar'):t('No matches','Nenhum resultado');
    matches.forEach(([name,target],i)=>{
      const li=node('li'); li.setAttribute('role','presentation');
      const b=node('button','vl-action',name); b.type='button';b.tabIndex=-1;b.id='vl-option-'+i;b.setAttribute('role','option');
      const symbol=node('span','',typeof target==='string'?'↗':'↵');symbol.setAttribute('aria-hidden','true');b.append(symbol);
      b.onclick=()=>run(i);li.append(b);list.append(li);
    });
    select(0);
  }
  function run(i) {
    const target=matches[i]?.[1]; if(!target) return;
    if(typeof target==='function'){target();input.focus();} else {dialog.close();location.assign(target);}
  }
  function open() {
    previous=document.activeElement;
    if(!dialog){
      dialog=node('dialog','vl-command');dialog.setAttribute('aria-labelledby','vl-command-title');
      const header=node('header');const title=node('strong','',t('Command terminal','Terminal de comandos'));title.id='vl-command-title';
      const close=node('button','vl-close','Esc');close.setAttribute('aria-label',t('Close','Fechar'));close.onclick=()=>dialog.close();header.append(title,close);
      const label=node('label','vl-query','>');input=node('input');input.type='search';input.placeholder=t('Find a route or action','Buscar rota ou ação');
      input.setAttribute('aria-label',input.placeholder);input.setAttribute('role','combobox');input.setAttribute('aria-controls','vl-commands');input.setAttribute('aria-expanded','true');input.setAttribute('aria-autocomplete','list');
      input.oninput=render;label.append(input);
      list=node('ul');list.id='vl-commands';list.setAttribute('role','listbox');list.setAttribute('aria-label',t('Commands','Comandos'));
      feedback=node('footer');feedback.setAttribute('role','status');
      dialog.append(header,label,list,feedback);document.body.append(dialog);
      dialog.addEventListener('close',()=>previous?.focus?.({preventScroll:true}));
      dialog.addEventListener('keydown',e=>{
        if(e.key==='Escape'){e.preventDefault();dialog.close();}
      });
      dialog.addEventListener('click',e=>{
        if(e.target!==dialog) return;
        const rect=dialog.getBoundingClientRect();
        if(e.clientX<rect.left || e.clientX>rect.right || e.clientY<rect.top || e.clientY>rect.bottom) dialog.close();
      });
      input.onkeydown=e=>{
        if(e.key==='Enter'){e.preventDefault();run(active);}
        else if(matches.length && ['ArrowUp','ArrowDown'].includes(e.key)){
          e.preventDefault();select((active+(e.key==='ArrowUp'?-1:1)+matches.length)%matches.length);
        }
      };
    }
    dialog.showModal();input.value='';render();input.focus();
  }
  pill.onclick=open;
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey) && !e.altKey && e.key.toLowerCase()==='k'){
      e.preventDefault();if(dialog?.open) dialog.close();else open();
    }
  });
})();
