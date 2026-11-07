export async function isTauri(): Promise<boolean> {
  return typeof window !== 'undefined' && (window as any).__TAURI__ !== undefined;
}
export async function openFilePicker(): Promise<File | null> {
  try {
    if ((window as any).__TAURI__) {
      // dynamic import — may not be installed in web build
      // @ts-ignore
      const mod = await import('@tauri-apps/api/dialog').catch(()=>null);
      if (mod) {
        const selected = await mod.open({ multiple: false, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
        if (!selected || Array.isArray(selected)) return null;
        return null;
      }
    }
  } catch {}
  return null;
}
