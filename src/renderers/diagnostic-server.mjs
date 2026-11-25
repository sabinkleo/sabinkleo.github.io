export default {
  check: component => component?.nativeDiagnostic === true,
  // client:visible observes direct children. Give the slot a measurable box.
  renderToStaticMarkup: (_component, _props, slots) => ({ html: '<div><astro-slot>' + (slots.default ?? '') + '</astro-slot></div>' }),
};
