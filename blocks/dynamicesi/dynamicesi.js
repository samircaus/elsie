export default async function decorate(block) {
  // block.textContent = '';

  const link = block.querySelector('a');
  if (link !== null) {
    const include = document.createElement('esi:include');
    include.setAttribute('src', link);
    block.innerHTML = include.outerHTML;
  }
}
