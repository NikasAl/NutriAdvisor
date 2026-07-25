import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nutriadvisor.app',
  appName: 'NutriAdvisor',
  webDir: 'out',
  server: {
    androidScheme: 'https',
  },
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

