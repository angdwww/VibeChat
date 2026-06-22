export const ENTER_FULLSCREEN = '\x1b[?1049h\x1b[?25l\x1b[?2004h\x1b[?1006l\x1b[?1002l\x1b[?1000h\x1b[H\x1b[2J';
export const EXIT_FULLSCREEN = '\x1b[?1006l\x1b[?1002l\x1b[?1000l\x1b[?2004l\x1b[?25h\x1b[?1049l';

export function enterFullScreen(output) {
  output.write(ENTER_FULLSCREEN);
}

export function exitFullScreen(output) {
  output.write(EXIT_FULLSCREEN);
}

export function createMouseWheelDecoder(onWheel) {
  let buffer = '';

  function push(chunk) {
    buffer += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
    let passthrough = '';

    while (true) {
      const start = nextMouseSequenceIndex(buffer);
      if (start < 0) {
        const retained = mouseSequencePrefixLength(buffer);
        passthrough += buffer.slice(0, buffer.length - retained);
        buffer = buffer.slice(buffer.length - retained);
        return passthrough;
      }

      passthrough += buffer.slice(0, start);
      buffer = buffer.slice(start);
      if (buffer.startsWith('\x1b[<')) {
        const match = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(buffer);
        if (!match) {
          if (isPartialSgrMouseSequence(buffer)) {
            return passthrough;
          }
          passthrough += buffer.slice(0, 3);
          buffer = buffer.slice(3);
          continue;
        }

        buffer = buffer.slice(match[0].length);
        reportMouseWheel(Number(match[1]), match[4]);
        continue;
      }

      if (buffer.length < 6) {
        return passthrough;
      }

      const button = buffer.charCodeAt(3) - 32;
      buffer = buffer.slice(6);
      reportMouseWheel(button, 'M');
    }
  }

  function reportMouseWheel(button, eventType) {
    if (eventType !== 'M' || !Number.isFinite(button) || (button & 64) === 0) {
      return;
    }
    onWheel((button & 1) === 1 ? 'down' : 'up');
  }

  return { push };
}

function nextMouseSequenceIndex(value) {
  const sgr = value.indexOf('\x1b[<');
  const legacy = value.indexOf('\x1b[M');
  if (sgr < 0) {
    return legacy;
  }
  if (legacy < 0) {
    return sgr;
  }
  return Math.min(sgr, legacy);
}

function mouseSequencePrefixLength(value) {
  const prefixes = ['\x1b[<', '\x1b[M'];
  let retained = 0;
  for (const prefix of prefixes) {
    const max = Math.min(prefix.length - 1, value.length);
    for (let length = max; length > retained; length -= 1) {
      if (value.endsWith(prefix.slice(0, length))) {
        retained = length;
        break;
      }
    }
  }
  return retained;
}

function isPartialSgrMouseSequence(value) {
  return /^\x1b\[<(\d+)?(;\d*)?(;\d*)?$/.test(value);
}

export function createRedrawScheduler(drawNow) {
  let pending = false;
  let suspended = 0;
  let dirty = false;

  function request() {
    if (suspended > 0) {
      dirty = true;
      return;
    }
    if (pending) {
      return;
    }
    pending = true;
    setImmediate(() => {
      pending = false;
      drawNow();
    });
  }

  return {
    request,
    drawNow() {
      pending = false;
      dirty = false;
      drawNow();
    },
    suspend() {
      suspended += 1;
    },
    resume() {
      suspended = Math.max(0, suspended - 1);
      if (suspended === 0 && dirty) {
        dirty = false;
        request();
      }
    }
  };
}
