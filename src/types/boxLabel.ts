export interface BoxLabelPreset {
  id: string;
  name: string;
  isDefault?: boolean;
  theme: 'dark' | 'light' | 'custom';
  bgColor: string;
  textColor: string;
  accentColor: string;
  fontFamily: 'serif' | 'sans' | 'mono';
  logoType: 'wovn' | 'customer' | 'custom' | 'none';
  customLogoUrl?: string;
  headerText?: string;
  showOrderNum?: boolean;
  showCustomerName?: boolean;
  showBoxItems?: boolean;
  showDestination?: boolean;
  qrSize: number;
  qrContainerStyle: 'white_box' | 'plain' | 'bordered';
  qrFgColor: string;
  qrBgColor: string;
  footerText?: string;
  labelSize: '3x4' | '4x6' | '4x3' | '2x1';
  createdAt?: string;
}

export const DEFAULT_BOX_LABEL_PRESETS: BoxLabelPreset[] = [
  {
    id: 'dark-minimal',
    name: 'Dark Minimal (Standard)',
    isDefault: true,
    theme: 'dark',
    bgColor: '#000000',
    textColor: '#ffffff',
    accentColor: '#ffffff',
    fontFamily: 'serif',
    logoType: 'wovn',
    headerText: 'WOVN',
    showOrderNum: false,
    showCustomerName: false,
    showBoxItems: false,
    showDestination: false,
    qrSize: 180,
    qrContainerStyle: 'white_box',
    qrFgColor: '#000000',
    qrBgColor: '#ffffff',
    footerText: '',
    labelSize: '3x4'
  },
  {
    id: 'clean-white',
    name: 'Clean White Thermal',
    isDefault: false,
    theme: 'light',
    bgColor: '#ffffff',
    textColor: '#000000',
    accentColor: '#000000',
    fontFamily: 'sans',
    logoType: 'wovn',
    headerText: 'WOVN PRINT LABS',
    showOrderNum: true,
    showCustomerName: true,
    showBoxItems: false,
    showDestination: false,
    qrSize: 160,
    qrContainerStyle: 'plain',
    qrFgColor: '#000000',
    qrBgColor: '#ffffff',
    footerText: 'Scan for Box Contents',
    labelSize: '3x4'
  },
  {
    id: 'detailed-shipping',
    name: 'Detailed Shipping Info',
    isDefault: false,
    theme: 'light',
    bgColor: '#ffffff',
    textColor: '#111827',
    accentColor: '#2563eb',
    fontFamily: 'sans',
    logoType: 'customer',
    headerText: '',
    showOrderNum: true,
    showCustomerName: true,
    showBoxItems: true,
    showDestination: true,
    qrSize: 140,
    qrContainerStyle: 'bordered',
    qrFgColor: '#000000',
    qrBgColor: '#ffffff',
    footerText: 'WOVN OS • PACKING SLIP VERIFIED',
    labelSize: '4x6'
  }
];
