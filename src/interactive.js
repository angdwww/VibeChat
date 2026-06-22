import readline from 'node:readline';

export function moveSelection(index, delta, length) {
  if (length <= 0) {
    return 0;
  }

  return (index + delta + length) % length;
}

export function renderSelectionMenu({ title, items, selectedIndex }) {
  return [
    '',
    title,
    '-'.repeat(title.length),
    'Use arrow keys to move, Enter to select, Escape to cancel.',
    '',
    ...items.map((item, index) => {
      const marker = index === selectedIndex ? '>' : ' ';
      return `${marker} ${item.label}${item.detail ? `  ${item.detail}` : ''}`;
    }),
    ''
  ].join('\n');
}

export async function selectFromList({
  title,
  items,
  input = process.stdin,
  output = process.stdout
}) {
  if (!input.isTTY || !output.isTTY || items.length === 0) {
    return null;
  }

  let selectedIndex = 0;
  let resolved = false;

  readline.emitKeypressEvents(input);
  input.setRawMode(true);

  function draw() {
    output.write('\x1b[2J\x1b[H');
    output.write(renderSelectionMenu({ title, items, selectedIndex }));
  }

  return new Promise((resolve) => {
    function finish(value) {
      if (resolved) {
        return;
      }
      resolved = true;
      input.off('keypress', onKeypress);
      input.setRawMode(false);
      output.write('\n');
      resolve(value);
    }

    function onKeypress(_, key) {
      if (key.name === 'up') {
        selectedIndex = moveSelection(selectedIndex, -1, items.length);
        draw();
        return;
      }
      if (key.name === 'down') {
        selectedIndex = moveSelection(selectedIndex, 1, items.length);
        draw();
        return;
      }
      if (key.name === 'return') {
        finish(items[selectedIndex]);
        return;
      }
      if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        finish(null);
      }
    }

    input.on('keypress', onKeypress);
    draw();
  });
}
