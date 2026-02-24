export function uiAlert(message: string): void {
  window.alert(message)
}

export function uiConfirm(message: string): boolean {
  return window.confirm(message)
}

export function uiPrompt(message: string, defaultValue = ''): string | null {
  return window.prompt(message, defaultValue)
}
