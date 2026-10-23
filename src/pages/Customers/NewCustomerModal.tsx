import React, { useState } from 'react';
import { X, Building2, Mail, Phone, MapPin, Loader2, User, Briefcase, Eye, EyeOff, Truck } from 'lucide-react';
import { db, firebaseConfig } from '../../lib/firebase';
import { collection, addDoc, doc, setDoc } from 'firebase/firestore';
import { sendCustomerWelcomeSMS } from '../../lib/smsService';
import { sendCustomerWelcomeEmail } from '../../lib/emailService';
import { tokens } from '../../lib/tokens';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { AddressAutocompleteInput } from '../../components/ui/AddressAutocompleteInput';

interface NewCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (id: string) => void;
  parentCustomerId?: string;
  parentCompanyName?: string;
}

const INITIAL_FORM = {
  company: '',
  email: '',
  phone: '',
  location: '',
  shippingStreet: '',
  shippingCity: '',
  shippingState: '',
  shippingZip: '',
  type: 'B2B' as 'B2B' | 'DTC',
  contactName: '',
};

export function NewCustomerModal({ isOpen, onClose, onSuccess, parentCustomerId, parentCompanyName }: NewCustomerModalProps) {
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  if (!isOpen) return null;

  const isBrandMode = Boolean(parentCustomerId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.company.trim() && !formData.contactName.trim() && !formData.email.trim()) {
      setError(`Please provide at least a ${isBrandMode ? 'brand name' : 'company name'}, contact name, or email.`);
      return;
    }

    if (password.trim() && password.trim().length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      let customerUid = '';
      const authEmail = formData.email.trim() 
        ? formData.email.trim().toLowerCase() 
        : formData.phone.trim() 
          ? `${formData.phone.replace(/\D/g, '')}@customer.inktheory.studio` 
          : '';

      if (authEmail && password.trim()) {
        const tempApp = initializeApp(firebaseConfig, `temp-auth-create-${Date.now()}`);
        const tempAuth = getAuth(tempApp);
        try {
          const userCredential = await createUserWithEmailAndPassword(
            tempAuth,
            authEmail,
            password.trim()
          );
          customerUid = userCredential.user.uid;
        } catch (authErr: any) {
          console.error("Auth creation failed:", authErr);
          throw new Error(`Authentication account creation failed: ${authErr.message}`);
        } finally {
          await deleteApp(tempApp);
        }
      }

      const resolvedLocation = formData.location.trim() || (
        formData.shippingCity.trim()
          ? `${formData.shippingCity.trim()}${formData.shippingState.trim() ? `, ${formData.shippingState.trim()}` : ''}`
          : ''
      );

      const docRef = await addDoc(collection(db, 'customers'), {
        ...formData,
        location: resolvedLocation,
        ...(parentCustomerId ? {
          parentCustomerId,
          parentCompanyName: parentCompanyName || ''
        } : {}),
        hasUnreadCreation: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Auto-create a customer user account if email or phone is provided
      if (authEmail) {
        const userRef = customerUid ? doc(db, 'users', customerUid) : doc(collection(db, 'users'));
        await setDoc(userRef, {
          id: userRef.id,
          uid: customerUid || '',
          email: authEmail,
          name: formData.contactName.trim() || formData.company.trim() || 'Client',
          role: 'Client',
          roleDescription: 'Client',
          customerId: docRef.id,
          createdAt: new Date().toISOString(),
          viewAll: true,
          phone: formData.phone.trim() || '-',
          companyName: formData.company.trim() || formData.contactName.trim() || '-'
        }, { merge: true });
      }

      // Trigger Welcome Notifications
      if (formData.email.trim()) {
        sendCustomerWelcomeEmail(docRef.id);
      }
      if (formData.phone.trim()) {
        sendCustomerWelcomeSMS(docRef.id);
      }

      setFormData(INITIAL_FORM);
      setPassword('');
      onSuccess(docRef.id);
      onClose();
    } catch (err: any) {
      console.error('Error creating customer:', err);
      setError(err.message || `Failed to create ${isBrandMode ? 'brand' : 'customer'}. Please try again.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-card w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-brand-border flex items-center justify-between shrink-0 bg-brand-bg/30">
          <div>
            <h2 className="font-serif text-2xl text-brand-primary">{isBrandMode ? 'New Brand' : 'New Customer'}</h2>
            <p className="text-sm text-brand-secondary mt-1">
              {isBrandMode
                ? `Add a sub-brand under ${parentCompanyName || 'this customer'} with its own shipping address and details.`
                : 'Add a new company or individual.'}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-brand-secondary hover:text-brand-primary hover:bg-brand-muted rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-lg text-sm font-medium border border-red-100 flex items-start gap-3">
              <div className="shrink-0 mt-0.5">!</div>
              <div>{error}</div>
            </div>
          )}

          <form id="new-customer-form" onSubmit={handleSubmit} className="space-y-6">
            
            <div className="grid grid-cols-2 gap-4">
               {/* Type Selector */}
               <div className="col-span-2 space-y-2">
                 <label className={tokens.typography.label}>{isBrandMode ? 'Brand Type' : 'Customer Type'}</label>
                 <div className="grid grid-cols-2 gap-3">
                   <button
                     type="button"
                     onClick={() => setFormData(prev => ({ ...prev, type: 'B2B' }))}
                     className={`flex items-center justify-center gap-2 py-3 px-4 rounded-lg border text-sm font-medium transition-all ${
                       formData.type === 'B2B' 
                         ? 'bg-brand-primary text-white border-brand-primary shadow-md' 
                         : 'bg-white text-brand-secondary border-brand-border hover:border-brand-primary/50'
                     }`}
                   >
                     <Briefcase size={18} />
                     B2B (Company)
                   </button>
                   <button
                     type="button"
                     onClick={() => setFormData(prev => ({ ...prev, type: 'DTC' }))}
                     className={`flex items-center justify-center gap-2 py-3 px-4 rounded-lg border text-sm font-medium transition-all ${
                       formData.type === 'DTC' 
                         ? 'bg-brand-primary text-white border-brand-primary shadow-md' 
                         : 'bg-white text-brand-secondary border-brand-border hover:border-brand-primary/50'
                     }`}
                   >
                     <User size={18} />
                     DTC (Individual)
                   </button>
                 </div>
               </div>
            </div>

            <div className="space-y-4">
              {formData.type === 'B2B' && (
                <div className="space-y-2">
                  <label htmlFor="company" className={tokens.typography.label}>{isBrandMode ? 'Brand Name *' : 'Company Name *'}</label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-secondary">
                      <Building2 size={18} />
                    </div>
                    <input
                      type="text"
                      id="company"
                      name="company"
                      value={formData.company}
                      onChange={handleChange}
                      placeholder={isBrandMode ? 'e.g. Sub-Brand Studio' : 'e.g. Acme Corp'}
                      className={`${tokens.components.input} pl-10`}
                      required={formData.type === 'B2B'}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="contactName" className={tokens.typography.label}>
                  {formData.type === 'B2B' ? 'Primary Contact Name' : 'Full Name *'}
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-secondary">
                    <User size={18} />
                  </div>
                  <input
                    type="text"
                    id="contactName"
                    name="contactName"
                    value={formData.contactName}
                    onChange={handleChange}
                    placeholder={formData.type === 'B2B' ? 'e.g. Jane Doe' : 'e.g. John Doe'}
                    className={`${tokens.components.input} pl-10`}
                    required={formData.type === 'DTC'}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="email" className={tokens.typography.label}>Email Address</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-secondary">
                    <Mail size={18} />
                  </div>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="billing@example.com"
                    className={`${tokens.components.input} pl-10`}
                  />
                </div>
              </div>

              {formData.email.trim() && (
                <div className="space-y-2 animate-in slide-in-from-top-1 duration-200">
                  <label htmlFor="password" className={tokens.typography.label}>Portal Login Password (Optional)</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      name="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Assign a login password (min 6 chars)"
                      className={`${tokens.components.input} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-secondary hover:text-brand-primary cursor-pointer"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-neutral-400 font-semibold">Assign a password to pre-create credentials for their client portal immediately.</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="phone" className={tokens.typography.label}>Phone Number</label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-secondary">
                      <Phone size={18} />
                    </div>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="(555) 000-0000"
                      className={`${tokens.components.input} pl-10`}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="location" className={tokens.typography.label}>Location / City</label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-secondary">
                      <MapPin size={18} />
                    </div>
                    <input
                      type="text"
                      id="location"
                      name="location"
                      value={formData.location}
                      onChange={handleChange}
                      placeholder="e.g. New York, NY"
                      className={`${tokens.components.input} pl-10`}
                    />
                  </div>
                </div>
              </div>

              {/* Shipping Address Section */}
              <div className="pt-3 border-t border-brand-border/60 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-primary">
                  <Truck size={14} className="text-brand-secondary" />
                  <span>Shipping Address</span>
                </div>
                <div className="space-y-1.5">
                  <label className={tokens.typography.label}>Street Address</label>
                  <AddressAutocompleteInput
                    value={formData.shippingStreet}
                    onChange={val => setFormData(prev => ({ ...prev, shippingStreet: val }))}
                    onAddressSelect={(parsed) => {
                      setFormData(prev => ({
                        ...prev,
                        shippingStreet: parsed.street,
                        shippingCity: parsed.city || prev.shippingCity,
                        shippingState: parsed.state || prev.shippingState,
                        shippingZip: parsed.zip || prev.shippingZip,
                        location: prev.location || (parsed.city ? `${parsed.city}${parsed.state ? `, ${parsed.state}` : ''}` : prev.location)
                      }));
                    }}
                    placeholder="123 Main St"
                    className={tokens.components.input}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label htmlFor="shippingCity" className={tokens.typography.label}>City</label>
                    <input
                      type="text"
                      id="shippingCity"
                      name="shippingCity"
                      value={formData.shippingCity}
                      onChange={handleChange}
                      placeholder="City"
                      className={tokens.components.input}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="shippingState" className={tokens.typography.label}>State</label>
                    <input
                      type="text"
                      id="shippingState"
                      name="shippingState"
                      value={formData.shippingState}
                      onChange={handleChange}
                      placeholder="CA"
                      className={tokens.components.input}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="shippingZip" className={tokens.typography.label}>Zip</label>
                    <input
                      type="text"
                      id="shippingZip"
                      name="shippingZip"
                      value={formData.shippingZip}
                      onChange={handleChange}
                      placeholder="90210"
                      className={tokens.components.input}
                    />
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-brand-border bg-brand-bg/50 flex justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-pill text-sm font-medium text-brand-secondary hover:text-brand-primary hover:bg-white border border-transparent hover:border-brand-border transition-all"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="new-customer-form"
            disabled={isSubmitting}
            className="px-6 py-2.5 rounded-pill text-sm font-medium text-white bg-brand-primary hover:bg-black transition-all shadow-sm flex items-center justify-center min-w-[140px]"
          >
            {isSubmitting ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              isBrandMode ? 'Create Brand' : 'Create Customer'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
