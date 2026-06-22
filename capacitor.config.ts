import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.fxafitness.app",
  appName: "FXA FITNESS",
  webDir: "capacitor-www",
  server: {
    url: "https://www.fxafitness.app/login",
    cleartext: false
  }
};

export default config;