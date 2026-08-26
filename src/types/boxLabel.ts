export interface BoxLabelPreset {
  id: string;
  name: string;
  isDefault?: boolean;
  theme: 'dark' | 'light' | 'custom';
  bgColor: string;
  textColor: string;
  accentColor: string;
  fontFamily: 'serif' | 'sans' | 'mono';
  
  // Outer Border / Stroke Customization
  showBorder?: boolean;
  borderWidth?: number; // Thickness in px (0 to 16px)
  borderColor?: string; // Border color hex (e.g. #000000)
  borderRadius?: number; // Corner radius in px (0 to 32px)

  logoType: 'wovn' | 'customer' | 'custom' | 'none';
  customLogoUrl?: string;
  headerText?: string;
  subHeaderText?: string; // Custom note/text right below the Order Number
  subHeaderFontSize?: 'sm' | 'md' | 'lg' | 'xl'; // Font scaling for subheader note
  showOrderNum?: boolean;
  showCustomerName?: boolean;
  showBoxItems?: boolean;
  showDestination?: boolean;
  qrSize: number;
  qrMarginTop?: number; // Top spacing above QR code in px (0 to 32px)
  qrContainerStyle: 'white_box' | 'plain' | 'bordered';
  qrFgColor: string;
  qrBgColor: string;
  footerText?: string;
  footerFontSize?: 'sm' | 'md' | 'lg' | 'xl'; // Font scaling for footer note
  labelSize: '3x4' | '4x6' | '4x3' | '2x1' | '3x2' | '2x3';
  createdAt?: string;
}

export const DEFAULT_BOX_LABEL_PRESETS: BoxLabelPreset[] = [
  {
    id: 'clean-white',
    name: 'Clean White Thermal (Standard)',
    isDefault: true,
    theme: 'light',
    bgColor: '#ffffff',
    textColor: '#000000',
    accentColor: '#000000',
    fontFamily: 'sans',
    showBorder: true,
    borderWidth: 4,
    borderColor: '#000000',
    borderRadius: 16,
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
    id: 'dark-minimal',
    name: 'Dark Minimal',
    isDefault: false,
    theme: 'dark',
    bgColor: '#000000',
    textColor: '#ffffff',
    accentColor: '#ffffff',
    fontFamily: 'serif',
    showBorder: false,
    borderWidth: 4,
    borderColor: '#ffffff',
    borderRadius: 16,
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
    id: 'detailed-shipping',
    name: 'Detailed Shipping Info',
    isDefault: false,
    theme: 'light',
    bgColor: '#ffffff',
    textColor: '#111827',
    accentColor: '#2563eb',
    fontFamily: 'sans',
    showBorder: true,
    borderWidth: 4,
    borderColor: '#000000',
    borderRadius: 16,
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
