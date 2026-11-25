import {mountEntry} from '../../assets/ai-client.mjs';
export default Object.assign((root:HTMLElement)=>mountEntry(root.querySelector('[data-ai-entry]')), {nativeDiagnostic:true});
