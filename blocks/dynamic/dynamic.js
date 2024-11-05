export default async function decorate(block) {
  // block.textContent = '';
  const link = block.querySelector('a');
  if (link !== null) {
    // const include = document.createElement('div');
    fetch(link).then((response) => response.text()).then((data) => {
      // include.innerHTML = data
      block.innerHTML = data;
    });
  }
}
