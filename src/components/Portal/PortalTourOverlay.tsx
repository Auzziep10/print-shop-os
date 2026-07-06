import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, ChevronLeft, ChevronRight, CornerDownRight, Play } from 'lucide-react';

interface TourStep {
  target: string;
  title: string;
  content: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  requiredPath?: string;
  pathName?: string;
}

interface PortalTourOverlayProps {
  activeTour: string;
  stepIndex: number;
  onNext: () => void;
  onBack: () => void;
  onExit: () => void;
  customerId: string;
}

export function PortalTourOverlay({
  activeTour,
  stepIndex,
  onNext,
  onBack,
  onExit,
  customerId
}: PortalTourOverlayProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});

  const tours: Record<string, { title: string; steps: TourStep[] }> = {
    tracking: {
      title: 'Checking Tracking & Status',
      steps: [
        {
          target: 'orders-tab',
          title: 'Step 1: Orders Dashboard',
          content: 'This tab shows all your current and past orders.',
          position: 'bottom',
          requiredPath: `/portal/${customerId}`,
          pathName: 'Orders Dashboard'
        },
        {
          target: 'orders-list',
          title: 'Step 2: Active Orders List',
          content: 'Here are all the orders you have placed. Click on any card to view its timeline and invoices.',
          position: 'top',
          requiredPath: `/portal/${customerId}`,
          pathName: 'Orders Dashboard'
        },
        {
          target: 'status-badge-0',
          title: 'Step 3: Status Badge',
          content: 'Check the color-coded badge to immediately see the production stage of your order.',
          position: 'right',
          requiredPath: `/portal/${customerId}`,
          pathName: 'Orders Dashboard'
        }
      ]
    },
    quote: {
      title: 'Requesting a Quote',
      steps: [
        {
          target: 'create-order-btn',
          title: 'Step 1: Open Order Builder',
          content: 'Start by clicking the "Create Order +" button in the header.',
          position: 'bottom',
          requiredPath: `/portal/${customerId}`,
          pathName: 'Orders Dashboard'
        },
        {
          target: 'catalog-grid',
          title: 'Step 2: Add Garments from Library',
          content: 'Browse the catalog tabs and add suggested, past, or rack garments to your request.',
          position: 'top',
          requiredPath: `/portal/${customerId}/create`,
          pathName: 'Create Order Builder'
        },
        {
          target: 'reorder-cart-btn',
          title: 'Step 3: Open Cart Drawer',
          content: 'Click the "Cart" button in the header to review your selected garments and options.',
          position: 'bottom',
          requiredPath: `/portal/${customerId}/create`,
          pathName: 'Create Order Builder'
        },
        {
          target: 'sizing-matrix',
          title: 'Step 4: Specify Quantities',
          content: 'In the cart drawer, specify the required quantities by size for your chosen styles.',
          position: 'top',
          requiredPath: `/portal/${customerId}/create`,
          pathName: 'Create Order Builder'
        },
        {
          target: 'customize-btn',
          title: 'Step 5: Customize Placement & Artwork',
          content: 'Click the "Customize Placements & Artwork" button to specify logo placements and attach mockups.',
          position: 'top',
          requiredPath: `/portal/${customerId}/create`,
          pathName: 'Create Order Builder'
        },
        {
          target: 'quote-submit',
          title: 'Step 6: Submit Quote Request',
          content: 'Click the "Submit Quote Request" button at the bottom of the drawer to submit your request.',
          position: 'top',
          requiredPath: `/portal/${customerId}/create`,
          pathName: 'Create Order Builder'
        }
      ]
    },
    reorders: {
      title: 'Reorders & Cart',
      steps: [
        {
          target: 'orders-tab',
          title: 'Step 1: Orders Tab',
          content: 'Go to your Orders Dashboard page.',
          position: 'bottom',
          requiredPath: `/portal/${customerId}`,
          pathName: 'Orders Dashboard'
        },
        {
          target: 'orders-list',
          title: 'Step 2: Past Orders',
          content: 'Find any previously placed order from your history list.',
          position: 'top',
          requiredPath: `/portal/${customerId}`,
          pathName: 'Orders Dashboard'
        },
        {
          target: 'reorder-item-btn-0',
          title: 'Step 3: Reorder Garment',
          content: 'Click the circular reorder icon to add this garment to your cart with a flight animation.',
          position: 'left',
          requiredPath: `/portal/${customerId}`,
          pathName: 'Orders Dashboard'
        },
        {
          target: 'reorder-cart-btn',
          title: 'Step 4: Persistent Cart',
          content: 'Review and edit batched items from your cart at any time.',
          position: 'bottom',
          requiredPath: `/portal/${customerId}`,
          pathName: 'Orders Dashboard'
        }
      ]
    },
    search_youth: {
      title: 'Youth Sizing',
      steps: [
        {
          target: 'create-order-btn',
          title: 'Step 1: Create Order',
          content: 'Click the header button to open the builder.',
          position: 'bottom',
          requiredPath: `/portal/${customerId}`,
          pathName: 'Orders Dashboard'
        },
        {
          target: 'add-youth-sizing-btn',
          title: 'Step 2: Add Youth Sizes',
          content: 'Click "+ Add Youth Sizing" to reveal the youth size grid (YXS to YXL).',
          position: 'bottom',
          requiredPath: `/portal/${customerId}/create`,
          pathName: 'Create Order Builder'
        }
      ]
    },
    vault: {
      title: 'Using the Asset Vault',
      steps: [
        {
          target: 'vault-tab',
          title: 'Step 1: Open Asset Vault',
          content: 'Navigate to your Asset Vault to manage logos and artworks.',
          position: 'bottom',
          requiredPath: `/portal/${customerId}`,
          pathName: 'Orders Dashboard'
        },
        {
          target: 'vault-upload-btn',
          title: 'Step 2: Upload Artwork',
          content: 'Click here to upload AI, PDF, EPS, or image files. All files are saved and synced to your visual customizer.',
          position: 'bottom',
          requiredPath: `/portal/${customerId}/vault`,
          pathName: 'Asset Vault'
        }
      ]
    },
    customize: {
      title: 'Customizing Garments',
      steps: [
        {
          target: 'create-order-btn',
          title: 'Step 1: Open Order Builder',
          content: 'First, click the "+ Create Order" button in the header.',
          position: 'bottom',
          requiredPath: `/portal/${customerId}`,
          pathName: 'Orders Dashboard'
        },
        {
          target: 'catalog-grid',
          title: 'Step 2: Add Garment from Library',
          content: 'Select any catalog garment to add it to your order request.',
          position: 'top',
          requiredPath: `/portal/${customerId}/create`,
          pathName: 'Create Order Builder'
        },
        {
          target: 'reorder-cart-btn',
          title: 'Step 3: Open Cart Drawer',
          content: 'Click the "Cart" button in the header to view your selected garments.',
          position: 'bottom',
          requiredPath: `/portal/${customerId}/create`,
          pathName: 'Create Order Builder'
        },
        {
          target: 'customize-btn',
          title: 'Step 4: Open Mockup Creator',
          content: 'Click "Customize Placements & Artwork" on your added product card to open the visual customizer workspace.',
          position: 'top',
          requiredPath: `/portal/${customerId}/create`,
          pathName: 'Create Order Builder'
        },
        {
          target: 'save-customization-btn',
          title: 'Step 5: Place Logos & Save',
          content: 'Select your garment color, upload or pick your logo from your vault, drag to position it, and click "Save Customization" to generate your mockups.',
          position: 'top',
          requiredPath: `/portal/${customerId}/create`,
          pathName: 'Create Order Builder'
        },
        {
          target: 'quote-submit',
          title: 'Step 6: Submit Quote Request',
          content: 'Fill out your sizes and click "Submit Quote Request" to send your specifications to our team.',
          position: 'top',
          requiredPath: `/portal/${customerId}/create`,
          pathName: 'Create Order Builder'
        }
      ]
    },
    profile: {
      title: 'Managing Your Profile',
      steps: [
        {
          target: 'profile-btn',
          title: 'Step 1: Profile Dropdown',
          content: 'Click your profile circle in the top right to open your account settings dropdown.',
          position: 'left',
          requiredPath: `/portal/${customerId}`,
          pathName: 'Orders Dashboard'
        },
        {
          target: 'profile-settings-btn',
          title: 'Step 2: Account Settings',
          content: 'Click "Account Settings" in the dropdown to customize your contact info, email, phone, and shipping address.',
          position: 'left',
          requiredPath: `/portal/${customerId}`,
          pathName: 'Orders Dashboard'
        },
        {
          target: 'profile-modal-fields',
          title: 'Step 3: Edit & Save Settings',
          content: 'Update your company details or shipping address fields, then click "Save Settings" to persist changes directly to your account.',
          position: 'left',
          requiredPath: `/portal/${customerId}`,
          pathName: 'Orders Dashboard'
        }
      ]
    }
  };

  const tour = tours[activeTour];
  if (!tour) return null;

  const currentStep = tour.steps[stepIndex];
  if (!currentStep) return null;

  // Handle path check
  const actualRequiredPath = currentStep.requiredPath;
  const isCorrectPath = actualRequiredPath ? location.pathname === actualRequiredPath : true;

  // Auto-sync step index if user navigates routes manually (e.g. clicking buttons or using browser back/forward)
  useEffect(() => {
    if (!tour || !currentStep) return;
    
    // Only auto-sync if we are NOT on the correct path for the current step
    const currentStepPath = currentStep.requiredPath;
    if (currentStepPath && location.pathname !== currentStepPath) {
      // Check if next step matches the new path
      const nextStep = tour.steps[stepIndex + 1];
      if (nextStep && nextStep.requiredPath && location.pathname === nextStep.requiredPath) {
        onNext();
        return;
      }
      
      // Check if previous step matches the new path
      const prevStep = tour.steps[stepIndex - 1];
      if (prevStep && prevStep.requiredPath && location.pathname === prevStep.requiredPath) {
        onBack();
        return;
      }
    }
  }, [location.pathname, stepIndex, tour, currentStep, onNext, onBack]);

  // Auto-sync customize tour steps when customizer modal opens/closes
  useEffect(() => {
    if (activeTour !== 'customize') return;

    const checkModalState = () => {
      const saveBtn = document.querySelector('[data-tour="save-customization-btn"]');
      if (stepIndex === 3 && saveBtn) {
        onNext();
      } else if (stepIndex === 4 && !saveBtn) {
        onBack();
      }
    };

    checkModalState();

    const interval = setInterval(checkModalState, 200);
    return () => clearInterval(interval);
  }, [activeTour, stepIndex, onNext, onBack]);

  // Auto-open cart drawer if target is inside the cart drawer
  useEffect(() => {
    if (!currentStep) return;
    const cartTargets = ['sizing-matrix', 'customize-btn', 'quote-submit', 'add-youth-sizing-btn'];
    if (cartTargets.includes(currentStep.target)) {
      window.dispatchEvent(new CustomEvent('wovn_open_cart_drawer'));
    }
  }, [stepIndex, activeTour, currentStep]);

  // Sync window size on resize
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Update bounding rect of target
  useEffect(() => {
    let interval: any;
    
    const updateBounds = () => {
      if (!isCorrectPath) {
        setRect(null);
        return;
      }
      
      const el = document.querySelector(`[data-tour="${currentStep.target}"]`);
      if (el) {
        const bounds = el.getBoundingClientRect();
        // Check if bounds have changed to avoid infinite loops
        setRect(prev => {
          if (!prev || prev.top !== bounds.top || prev.left !== bounds.left || prev.width !== bounds.width || prev.height !== bounds.height) {
            return bounds;
          }
          return prev;
        });
      } else {
        setRect(null);
      }
    };

    updateBounds();
    // Poll bounds slightly in case of loading animations
    interval = setInterval(updateBounds, 300);

    window.addEventListener('scroll', updateBounds, { passive: true });
    window.addEventListener('resize', updateBounds);

    return () => {
      clearInterval(interval);
      window.removeEventListener('scroll', updateBounds);
      window.removeEventListener('resize', updateBounds);
    };
  }, [currentStep.target, isCorrectPath, location.pathname, stepIndex]);

  // Elevate active target element or its topmost positioned ancestor above the tour backdrop
  useEffect(() => {
    if (!isCorrectPath || !currentStep.target) return;

    const el = document.querySelector(`[data-tour="${currentStep.target}"]`) as HTMLElement;
    if (!el) return;

    // Save original styles of the target element
    const originalElPosition = el.style.position;
    const originalElZIndex = el.style.zIndex;
    const originalElPointerEvents = el.style.pointerEvents;

    // Make sure target has pointer events enabled
    el.style.pointerEvents = 'auto';

    let elevatedAncestor: HTMLElement | null = null;
    let originalAncestorZIndex = '';
    let originalAncestorPosition = '';

    // Walk up the DOM to find the topmost positioned wrapper (e.g. modal overlay, dropdown container)
    let current: HTMLElement | null = el;
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current);
      if (
        current.classList.contains('profile-dropdown-container') ||
        (style.zIndex !== 'auto' && style.zIndex !== '0') ||
        style.position === 'fixed' ||
        style.position === 'absolute' ||
        style.position === 'relative'
      ) {
        elevatedAncestor = current;
      }
      current = current.parentElement;
    }

    const elementToElevate = elevatedAncestor || el;
    const isTarget = elementToElevate === el;

    if (!isTarget) {
      originalAncestorZIndex = elementToElevate.style.zIndex;
      originalAncestorPosition = elementToElevate.style.position;
    }

    const computedStyle = window.getComputedStyle(elementToElevate);
    if (computedStyle.position === 'static') {
      elementToElevate.style.position = 'relative';
    }
    elementToElevate.style.zIndex = '150';

    return () => {
      if (el) {
        el.style.position = originalElPosition;
        el.style.zIndex = originalElZIndex;
        el.style.pointerEvents = originalElPointerEvents;
      }
      if (elementToElevate && elementToElevate !== el) {
        elementToElevate.style.zIndex = originalAncestorZIndex;
        elementToElevate.style.position = originalAncestorPosition;
      }
    };
  }, [currentStep.target, isCorrectPath, stepIndex]);

  // Position tooltip relative to target rect
  useEffect(() => {
    if (!rect) {
      // Elements not found, center tooltip on screen
      setTooltipStyle({
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 160
      });
      return;
    }

    const pad = 12;
    const tooltipWidth = tooltipRef.current?.offsetWidth || 340;
    const tooltipHeight = tooltipRef.current?.offsetHeight || 180;
    
    let top = 0;
    let left = 0;

    switch (currentStep.position) {
      case 'bottom':
        top = rect.bottom + pad;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
      case 'top':
        top = rect.top - tooltipHeight - pad;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
      case 'left':
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.left - tooltipWidth - pad;
        break;
      case 'right':
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.right + pad;
        break;
    }

    // Keep tooltip in viewport boundaries
    left = Math.max(16, Math.min(left, windowSize.width - tooltipWidth - 16));
    top = Math.max(16, Math.min(top, windowSize.height - tooltipHeight - 16));

    setTooltipStyle({
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      zIndex: 160
    });
  }, [rect, currentStep.position, windowSize, stepIndex]);

  // Handle redirect navigation
  const handleRedirect = () => {
    if (actualRequiredPath) {
      navigate(actualRequiredPath);
    }
  };

  // Generate polygon clip-path cutout mask
  const getClipPath = () => {
    if (!rect) return 'none';
    const pad = 8;
    const l = rect.left - pad;
    const t = rect.top - pad;
    const r = rect.right + pad;
    const b = rect.bottom + pad;

    return `polygon(
      0% 0%,
      0% 100%,
      ${l}px 100%,
      ${l}px ${t}px,
      ${r}px ${t}px,
      ${r}px ${b}px,
      ${l}px ${b}px,
      ${l}px 100%,
      100% 100%,
      100% 0%
    )`;
  };

  return (
    <>
      {/* Darkened & Blurred Mask Layer */}
      <div className="fixed inset-0 z-[140] pointer-events-none">
        <div 
          className="absolute inset-0 bg-black/60 backdrop-blur-[2px] pointer-events-auto transition-all duration-300"
          style={{ clipPath: getClipPath() }}
        ></div>
      </div>

      {/* Floating Tooltip Card */}
      <div className="fixed inset-0 z-[200] pointer-events-none">
        <div 
          ref={tooltipRef}
          style={tooltipStyle}
          className="w-[340px] bg-white rounded-3xl p-6 shadow-2xl border border-neutral-100 pointer-events-auto flex flex-col gap-4 animate-in zoom-in-95 duration-200"
        >
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded">
              {tour.title}
            </span>
            <button 
              onClick={onExit}
              className="text-neutral-400 hover:text-black transition-colors"
              title="Exit Tour"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <h4 className="font-bold text-neutral-900 text-sm">{currentStep.title}</h4>
            <p className="text-xs text-neutral-600 leading-relaxed">{currentStep.content}</p>
          </div>

          {/* Redirect prompt if on wrong page */}
          {!isCorrectPath && actualRequiredPath && (
            <div className="bg-[#f0ebe1] rounded-2xl p-4 border border-[#e6e2db] flex flex-col gap-2">
              <p className="text-[11px] font-semibold text-neutral-800 flex items-center gap-1">
                <CornerDownRight size={12} />
                This step requires the {currentStep.pathName}.
              </p>
              <button 
                onClick={handleRedirect}
                className="bg-black text-white hover:bg-neutral-800 px-4 py-2 rounded-xl text-[10px] font-bold tracking-wide transition-all w-fit cursor-pointer flex items-center gap-1"
              >
                <Play size={8} fill="white" />
                Go to {currentStep.pathName}
              </button>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-neutral-100 pt-4 mt-1">
            <span className="text-[10px] font-bold text-neutral-400">
              Step {stepIndex + 1} of {tour.steps.length}
            </span>

            <div className="flex items-center gap-2">
              <button
                disabled={stepIndex === 0}
                onClick={onBack}
                className="w-8 h-8 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-500 hover:text-black hover:border-black disabled:opacity-30 disabled:hover:text-neutral-500 disabled:hover:border-neutral-200 transition-colors cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>

              {stepIndex < tour.steps.length - 1 ? (
                <button
                  disabled={!isCorrectPath}
                  onClick={onNext}
                  className="bg-black hover:bg-neutral-800 text-white w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-30 disabled:hover:bg-black cursor-pointer"
                >
                  <ChevronRight size={16} />
                </button>
              ) : (
                <button
                  onClick={onExit}
                  className="bg-black hover:bg-neutral-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
