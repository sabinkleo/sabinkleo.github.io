export default {
  check: component => component?.nativeDiagnostic === true,
  renderToStaticMarkup: (_component, _props, slots) => ({ html: '<astro-slot>' + (slots.default ?? '') + '</astro-slot>' }),
};
