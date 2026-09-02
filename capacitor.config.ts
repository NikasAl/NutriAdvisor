import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ru.kreagenium.nuadvi',
  appName: 'NutriAdvisor',
  webDir: 'out',
  server: {
    androidScheme: 'https',
  },
  // @ts-expect-error splashScreen is valid but missing from @capacitor/cli types
  splashScreen: {
    launchShowDuration: 500,
    backgroundColor: '#059669',
    showSpinner: false,
    androidScaleType: 'CENTER_CROP',
  },
  android: {
    backgroundColor: '#059669',
  },
};

export default config;

