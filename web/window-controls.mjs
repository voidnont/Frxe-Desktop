export async function requestAppExit({ invoke, currentWindow }) {
  if (typeof invoke === 'function') {
    try {
      await invoke('exit_app');
      return 'native-exit';
    } catch {
      // Fall through to a direct window teardown only if native exit is unavailable.
    }
  }
  if (currentWindow?.destroy) {
    await currentWindow.destroy();
    return 'destroy';
  }
  if (currentWindow?.close) {
    await currentWindow.close();
    return 'close';
  }
  return 'noop';
}

export function installExitButton(tauri = globalThis.window?.__TAURI__) {
  if (typeof document === 'undefined') return;
  document.addEventListener('click', async (event) => {
    const button = event.target?.closest?.('[data-window="close"]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    const invoke = tauri?.core?.invoke ? tauri.core.invoke.bind(tauri.core) : null;
    const currentWindow = tauri?.window?.getCurrentWindow?.();
    await requestAppExit({ invoke, currentWindow });
  }, true);
}

installExitButton();
