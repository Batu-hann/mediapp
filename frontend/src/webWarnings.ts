import { Platform } from 'react-native';

const webWarningState = globalThis as typeof globalThis & {
  __mediassistWebWarningsPatched?: boolean;
};

if (__DEV__ && Platform.OS === 'web' && !webWarningState.__mediassistWebWarningsPatched) {
  const originalWarn = console.warn.bind(console);
  const ignoredWarnings = ['props.pointerEvents is deprecated. Use style.pointerEvents'];

  webWarningState.__mediassistWebWarningsPatched = true;
  console.warn = (...args: unknown[]) => {
    const message = String(args[0] ?? '');
    if (ignoredWarnings.some((warning) => message.includes(warning))) {
      return;
    }

    originalWarn(...args);
  };
}
