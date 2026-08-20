import { useState, useEffect, useRef } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

const STATE_ABBRS: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
  'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
  'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
  'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
  'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
  'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY'
};

export function normalizeState(stateName: string): string {
  if (!stateName) return '';
  const trimmed = stateName.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  const lower = trimmed.toLowerCase();
  return STATE_ABBRS[lower] || trimmed.toUpperCase();
}

export function preserveHouseNumber(userQuery: string, parsedStreet: string): string {
  if (!parsedStreet) return userQuery ? userQuery.trim() : '';
  if (!userQuery) return parsedStreet;
  
  // Extract leading house number from user query (e.g. "712", "712B", "10420", "123-A")
  const queryHouseNumMatch = userQuery.trim().match(/^(\d+[A-Za-z\-\/]*)\b/);
  if (!queryHouseNumMatch) return parsedStreet;
  
  const queryHouseNum = queryHouseNumMatch[1];
  
  // Check if parsedStreet already starts with a house number
  const streetHasHouseNum = /^(\d+[A-Za-z\-\/]*)\s+/.test(parsedStreet.trim());
  if (streetHasHouseNum) return parsedStreet;
  
  // Prepend the user's typed house number to the street name
  return `${queryHouseNum} ${parsedStreet.trim()}`.trim();
}

export function parseAddressString(formattedAddress: string, userQuery?: string): { street: string; city: string; state: string; zip: string } {
  if (!formattedAddress) return { street: '', city: '', state: '', zip: '' };
  
  const clean = formattedAddress.replace(/,\s*(USA|United States)$/i, '').trim();
  const parts = clean.split(',').map(p => p.trim());
  
  if (parts.length === 1) {
    const rawStreet = parts[0];
    const street = userQuery ? preserveHouseNumber(userQuery, rawStreet) : rawStreet;
    return { street, city: '', state: '', zip: '' };
  }
  
  const lastPart = parts[parts.length - 1];
  const stateZipMatch = lastPart.match(/^([A-Za-z\s]+)\s+(\d{5}(?:-\d{4})?)$/);
  
  let state = '';
  let zip = '';
  let city = '';
  let rawStreet = '';
  
  if (stateZipMatch) {
    state = normalizeState(stateZipMatch[1]);
    zip = stateZipMatch[2];
    city = parts.length >= 3 ? parts[parts.length - 2] : '';
    rawStreet = parts.slice(0, parts.length - 2).join(', ');
  } else if (parts.length >= 3) {
    state = normalizeState(lastPart);
    city = parts[parts.length - 2];
    rawStreet = parts.slice(0, parts.length - 2).join(', ');
  } else if (parts.length === 2) {
    rawStreet = parts[0];
    city = parts[1];
  }
  
  const street = userQuery ? preserveHouseNumber(userQuery, rawStreet) : rawStreet;
  return { street, city, state, zip };
}

export interface AddressSuggestion {
  id: string;
  formattedAddress: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  placeId?: string;
}

interface AddressAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onAddressSelect: (parsedAddress: { street: string; city: string; state: string; zip: string }) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export function AddressAutocompleteInput({
  value,
  onChange,
  onAddressSelect,
  placeholder = 'e.g. 123 Main St',
  className = '',
  autoFocus = false
}: AddressAutocompleteInputProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<any>(null);

  // Auto-inject Google Maps SDK if API key is supplied in env
  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
    if (!apiKey || (window as any).google?.maps?.places) return;

    const existingScript = document.getElementById('google-maps-places-sdk');
    if (existingScript) return;

    const script = document.createElement('script');
    script.id = 'google-maps-places-sdk';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch address predictions
  useEffect(() => {
    if (!value || value.trim().length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setIsLoading(true);
      const query = value.trim();

      let hasFinished = false;
      const finish = (sugg: AddressSuggestion[]) => {
        if (hasFinished) return;
        hasFinished = true;
        setSuggestions(sugg);
        setIsOpen(sugg.length > 0);
        setIsLoading(false);
      };

      // 1.2s Hard Safety Timeout to guarantee the loading spinner never freezes
      const safetyTimeout = setTimeout(() => {
        if (!hasFinished) {
          fetchPhotonSuggestions(query, finish);
        }
      }, 1200);

      try {
        const maps = (window as any).google?.maps;

        if (maps && maps.places) {
          const service = new maps.places.AutocompleteService();
          service.getPlacePredictions(
            { input: query, types: ['address'], componentRestrictions: { country: 'us' } },
            (predictions: any[], status: any) => {
              clearTimeout(safetyTimeout);
              if (status === maps.places.PlacesServiceStatus.OK && predictions?.length) {
                const googleSuggestions: AddressSuggestion[] = predictions.map((pred: any) => {
                  const parsed = parseAddressString(pred.description, query);
                  const mainText = pred.structured_formatting?.main_text || pred.description;
                  const rawStreet = parsed.street || mainText;
                  const street = preserveHouseNumber(query, rawStreet);
                  return {
                    id: pred.place_id,
                    formattedAddress: pred.description,
                    street: street,
                    city: parsed.city,
                    state: parsed.state,
                    zip: parsed.zip,
                    placeId: pred.place_id
                  };
                });
                finish(googleSuggestions);
              } else {
                fetchPhotonSuggestions(query, finish);
              }
            }
          );
        } else {
          clearTimeout(safetyTimeout);
          fetchPhotonSuggestions(query, finish);
        }
      } catch (err) {
        clearTimeout(safetyTimeout);
        console.warn("Google Places autocomplete search error, using fallback:", err);
        fetchPhotonSuggestions(query, finish);
      }
    }, 200);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [value]);

  const fetchPhotonSuggestions = async (queryStr: string, finishFn?: (sugg: AddressSuggestion[]) => void) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(queryStr)}&limit=5&lang=en`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error("Photon API error");
      const data = await res.json();

      const photonItems: AddressSuggestion[] = (data.features || [])
        .map((f: any, idx: number) => {
          const p = f.properties || {};
          const houseNum = p.housenumber || '';
          const streetName = p.street || p.name || '';
          const rawStreet = houseNum ? `${houseNum} ${streetName}`.trim() : streetName;
          const street = preserveHouseNumber(queryStr, rawStreet);
          const city = p.city || p.town || p.village || p.county || '';
          const state = normalizeState(p.state || '');
          const zip = p.postcode || '';

          const parts = [street, city, state, zip].filter(Boolean);
          const formatted = parts.join(', ');

          return {
            id: `photon-${idx}-${Date.now()}`,
            formattedAddress: formatted,
            street,
            city,
            state,
            zip
          };
        })
        .filter((item: AddressSuggestion) => item.street && (item.city || item.state));

      if (finishFn) finishFn(photonItems);
      else {
        setSuggestions(photonItems);
        setIsOpen(photonItems.length > 0);
        setIsLoading(false);
      }
    } catch (e) {
      console.warn("Address autocomplete fetch error:", e);
      if (finishFn) finishFn([]);
      else {
        setSuggestions([]);
        setIsOpen(false);
        setIsLoading(false);
      }
    }
  };

  const handleSelect = (s: AddressSuggestion) => {
    const initialParsed = { street: s.street, city: s.city, state: s.state, zip: s.zip };
    onAddressSelect(initialParsed);
    onChange(s.street);
    setIsOpen(false);

    // If Google Maps is loaded and zip is missing or detailed components needed, resolve details in background
    const maps = (window as any).google?.maps;
    if (s.placeId && maps?.Geocoder) {
      try {
        const geocoder = new maps.Geocoder();
        geocoder.geocode({ placeId: s.placeId }, (results: any[], gStatus: any) => {
          if (gStatus === 'OK' && results?.[0]) {
            const res = results[0];
            let streetNum = '';
            let route = '';
            let city = '';
            let state = '';
            let zip = '';

            res.address_components?.forEach((c: any) => {
              const types = c.types;
              if (types.includes('street_number')) streetNum = c.long_name;
              else if (types.includes('route')) route = c.short_name || c.long_name;
              else if (types.includes('locality')) city = c.long_name;
              else if (types.includes('administrative_area_level_1')) state = c.short_name;
              else if (types.includes('postal_code')) zip = c.long_name;
            });

            const queryHouseNumMatch = value.trim().match(/^(\d+[A-Za-z\-\/]*)\b/);
            const typedHouseNum = queryHouseNumMatch ? queryHouseNumMatch[1] : '';
            const effectiveHouseNum = streetNum || typedHouseNum;
            const baseStreet = route || s.street;
            const preciseStreet = effectiveHouseNum 
              ? preserveHouseNumber(effectiveHouseNum, baseStreet)
              : baseStreet;

            const updated = {
              street: preciseStreet || s.street,
              city: city || s.city,
              state: normalizeState(state || s.state),
              zip: zip || s.zip
            };
            onAddressSelect(updated);
            if (preciseStreet) onChange(preciseStreet);
          }
        });
      } catch (e) {
        console.warn("Background geocoding error:", e);
      }
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          className={className}
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
            <Loader2 size={14} className="animate-spin" />
          </div>
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-neutral-200 rounded-2xl shadow-xl z-[999] overflow-hidden py-1 animate-in fade-in slide-in-from-top-1 duration-150">
          {suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => handleSelect(s)}
              className="w-full text-left px-4 py-2.5 hover:bg-neutral-50 flex items-start gap-2.5 transition-colors cursor-pointer group border-b border-neutral-100 last:border-none"
            >
              <MapPin size={15} className="text-neutral-400 group-hover:text-black shrink-0 mt-0.5" />
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-neutral-900 group-hover:text-black truncate">
                  {s.street}
                </span>
                <span className="text-[11px] font-medium text-neutral-500 truncate">
                  {[s.city, s.state, s.zip].filter(Boolean).join(', ')}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
