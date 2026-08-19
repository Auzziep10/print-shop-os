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
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      setIsLoading(true);
      const query = value.trim();

      try {
        const maps = (window as any).google?.maps;

        // 1. Try Google Places Autocomplete if API loaded
        if (maps && maps.places) {
          const service = new maps.places.AutocompleteService();
          service.getPlacePredictions(
            { input: query, types: ['address'], componentRestrictions: { country: 'us' } },
            (predictions: any[], status: any) => {
              if (status === maps.places.PlacesServiceStatus.OK && predictions?.length) {
                const geocoder = new maps.Geocoder();
                const googleSuggestions: AddressSuggestion[] = [];

                let completed = 0;
                predictions.slice(0, 5).forEach((pred) => {
                  geocoder.geocode({ placeId: pred.place_id }, (results: any[], gStatus: any) => {
                    completed++;
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

                      const street = `${streetNum} ${route}`.trim() || pred.structured_formatting?.main_text || '';
                      googleSuggestions.push({
                        id: pred.place_id,
                        formattedAddress: pred.description,
                        street: street,
                        city: city,
                        state: normalizeState(state),
                        zip: zip,
                        placeId: pred.place_id
                      });
                    }

                    if (completed === Math.min(predictions.length, 5)) {
                      if (googleSuggestions.length > 0) {
                        setSuggestions(googleSuggestions);
                        setIsOpen(true);
                        setIsLoading(false);
                      } else {
                        fetchPhotonSuggestions(query);
                      }
                    }
                  });
                });
                return;
              } else {
                fetchPhotonSuggestions(query);
              }
            }
          );
        } else {
          fetchPhotonSuggestions(query);
        }
      } catch (err) {
        console.warn("Google Places autocomplete search error, using fallback:", err);
        fetchPhotonSuggestions(query);
      }
    }, 200);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [value]);

  const fetchPhotonSuggestions = async (queryStr: string) => {
    try {
      const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(queryStr)}&limit=5&lang=en`);
      if (!res.ok) throw new Error("Photon API error");
      const data = await res.json();

      const photonItems: AddressSuggestion[] = (data.features || [])
        .map((f: any, idx: number) => {
          const p = f.properties || {};
          const houseNum = p.housenumber || '';
          const streetName = p.street || p.name || '';
          const street = houseNum ? `${houseNum} ${streetName}`.trim() : streetName;
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

      setSuggestions(photonItems);
      setIsOpen(photonItems.length > 0);
    } catch (e) {
      console.warn("Address autocomplete fetch error:", e);
      setSuggestions([]);
      setIsOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = (s: AddressSuggestion) => {
    onAddressSelect({
      street: s.street,
      city: s.city,
      state: s.state,
      zip: s.zip
    });
    onChange(s.street);
    setIsOpen(false);
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
