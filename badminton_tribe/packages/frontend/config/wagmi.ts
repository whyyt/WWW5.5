import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import {
  polygonAmoy,
  hardhat,
} from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'BadmintonTribe',
  projectId: 'YOUR_PROJECT_ID',
  chains: [
    hardhat,
    polygonAmoy,
  ],
  ssr: true,
});
