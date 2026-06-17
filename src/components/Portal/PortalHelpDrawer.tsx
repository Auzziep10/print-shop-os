import { useState } from 'react';
import { X, Search, HelpCircle, ArrowRight, Play, BookOpen, Clock, ShieldAlert, Award, User } from 'lucide-react';

interface PortalHelpDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onStartTour: (tourId: string) => void;
}

export function PortalHelpDrawer({ isOpen, onClose, onStartTour }: PortalHelpDrawerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const tutorials = [
    {
      id: 'tracking',
      title: 'Checking Tracking & Order Status',
      description: 'Learn how to monitor your order progress, inspect status badges, and fetch tracking numbers.',
      icon: <Clock size={20} className="text-blue-500" />,
      steps: [
        'Navigate to the main portal dashboard ("Orders").',
        'Look at your order cards to check their status badges (e.g., Request Created, Production, Shipped).',
        'Click on any order card to see its full activities log, invoices, and shipping details.',
        'When shipped, tracking links and carrier info will be listed directly in the "Shipping Information" panel.'
      ]
    },
    {
      id: 'quote',
      title: 'Requesting a Quote',
      description: 'Find out how to submit garment specifications and artwork to receive custom pricing.',
      icon: <BookOpen size={20} className="text-emerald-500" />,
      steps: [
        'Click the "+ Create Order" or "Request Quote" buttons.',
        'Choose items from your "Design Your Rack" collections, "Suggested Items" (curated by us), or "Past Garments".',
        'Click on any garment card image to open the Interactive Lightbox. Hover over the large image to zoom in and inspect details.',
        'Specify your required quantities by size (XS, S, M, L, XL, etc.) and color.',
        'Upload your design mockup or select an artwork file from your Asset Vault.',
        'Click "Submit Quote Request". We will draft pricing and mockups for your review.'
      ]
    },
    {
      id: 'vault',
      title: 'Using the Asset Vault',
      description: 'Upload, organize, download, and delete brand logos or vector artwork files.',
      icon: <Award size={20} className="text-amber-500" />,
      steps: [
        'Select the "Asset Vault" tab in the header navigation.',
        'Click "Upload New Asset" to upload AI, PDF, EPS, or image files (up to 10MB).',
        'Your vault assets are securely saved and can be loaded instantly in the Garment Customizer.',
        'Download assets to check them, or click the Trash icon to remove old assets.'
      ]
    },
    {
      id: 'customize',
      title: 'Customizing Garments',
      description: 'Learn how to apply logos, select colors, scale overlays, and preview customized mockups.',
      icon: <Play size={20} className="text-purple-500" />,
      steps: [
        'On the Quote Request or Create Order page, add a garment style to your list.',
        'Click the "Customize" button (with the Sparkles icon) in the garment row.',
        'In the customizer modal, pick your desired garment color and logo placement (e.g., Left Chest).',
        'Select a logo from your Asset Vault, or upload a new one directly.',
        'Adjust the Size, Horizontal, and Vertical position sliders to align the logo on the garment.',
        'Click "Save Customization" to automatically render and save your custom composite mockup!',
        'Click on your customized garment thumbnail to view the high-resolution multi-view mockup with zoom magnification.'
      ]
    },
    {
      id: 'profile',
      title: 'Managing Your Profile',
      description: 'Customize your company name, email, phone number, and shipping address.',
      icon: <User size={20} className="text-pink-500" />,
      steps: [
        'Click the profile circle button in the top right corner of the navigation bar.',
        'Select "Account Settings" from the dropdown menu.',
        'Update your primary contact name, company name, email, phone number, or shipping address fields.',
        'Click "Save Settings" to update your profile. Log out securely using the "Log Out" link in the same profile dropdown.'
      ]
    }
  ];

  const filteredTutorials = tutorials.filter(t => 
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex justify-end bg-black/30 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Backdrop Click */}
      <div className="absolute inset-0" onClick={onClose}></div>

      {/* Drawer Panel */}
      <div className="w-full max-w-[480px] h-full bg-white shadow-2xl flex flex-col relative z-10 animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
          <div className="flex items-center gap-2">
            <HelpCircle size={22} className="text-black" />
            <h2 className="text-xl font-serif text-neutral-900">Help Center</h2>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-neutral-500 hover:text-black hover:border-black transition-colors shadow-sm cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-6 py-4 border-b border-neutral-100">
          <div className="relative group">
            <input 
              type="text" 
              placeholder="Search tutorials & guides..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium focus:outline-none focus:bg-white focus:border-neutral-300 transition-all placeholder:text-neutral-400"
            />
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-neutral-600 transition-colors" size={16} />
          </div>
        </div>

        {/* Guides List */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
          {filteredTutorials.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-neutral-400 gap-2">
              <ShieldAlert size={28} />
              <p className="text-sm font-medium">No guides match your search.</p>
            </div>
          ) : (
            filteredTutorials.map((tut, index) => {
              const isExpanded = expandedIndex === index;
              return (
                <div 
                  key={tut.id} 
                  className={`border rounded-2xl transition-all ${
                    isExpanded 
                      ? 'border-black bg-neutral-50/50 shadow-sm' 
                      : 'border-neutral-200 hover:border-neutral-300'
                  }`}
                >
                  {/* Tutorial Row Header */}
                  <button
                    onClick={() => setExpandedIndex(isExpanded ? null : index)}
                    className="w-full text-left p-5 flex items-start gap-4 cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-xl bg-white border border-neutral-100 flex items-center justify-center shadow-sm shrink-0">
                      {tut.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-neutral-900 text-sm">{tut.title}</h3>
                      <p className="text-xs text-neutral-500 mt-1 leading-relaxed">{tut.description}</p>
                    </div>
                  </button>

                  {/* Expanded Steps */}
                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-neutral-100 pt-4 flex flex-col gap-4 animate-in fade-in duration-200">
                      <div className="flex flex-col gap-3">
                        {tut.steps.map((step, idx) => (
                          <div key={idx} className="flex gap-3">
                            <span className="w-5 h-5 rounded-full bg-neutral-950 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            <p className="text-xs text-neutral-700 leading-relaxed">{step}</p>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={() => {
                          onStartTour(tut.id);
                          onClose();
                        }}
                        className="w-full bg-neutral-950 hover:bg-neutral-800 text-white py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
                      >
                        <Play size={12} fill="white" />
                        Start Interactive Tour
                        <ArrowRight size={12} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

      </div>
    </div>
  );
}
