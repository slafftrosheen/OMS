/**
 * Click outside action for Svelte
 * Calls the callback when user clicks outside the element
 */
export function clickOutside(node: HTMLElement, callback: () => void) {
  const handleClick = (event: MouseEvent) => {
    if (node && !node.contains(event.target as Node) && !event.defaultPrevented) {
      callback();
    }
  };

  // Use capture phase to handle clicks before they bubble
  document.addEventListener('click', handleClick, true);

  return {
    destroy() {
      document.removeEventListener('click', handleClick, true);
    }
  };
}
