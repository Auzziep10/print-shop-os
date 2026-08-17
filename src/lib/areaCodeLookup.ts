// US and Canada Area Code to State and Timezone Mapping Helper

interface AreaCodeData {
  state: string;
  stateAbbr: string;
  tzAbbr: string; // PT, MT, CT, ET, AKT, HST
  tzName: string; // Pacific, Mountain, Central, Eastern, Alaska, Hawaii
  timeZoneIdentifier: string; // America/Los_Angeles, America/New_York, etc.
}

const AREA_CODE_MAP: Record<string, AreaCodeData> = {
  // California (PT)
  '209': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '213': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '310': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '323': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '408': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '415': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '424': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '442': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '510': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '530': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '559': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '562': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '619': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '626': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '650': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '657': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '661': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '707': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '714': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '747': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '760': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '805': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '818': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '831': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '858': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '909': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '916': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '925': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '949': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '951': { state: 'California', stateAbbr: 'CA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },

  // New York (ET)
  '212': { state: 'New York', stateAbbr: 'NY', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '315': { state: 'New York', stateAbbr: 'NY', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '332': { state: 'New York', stateAbbr: 'NY', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '347': { state: 'New York', stateAbbr: 'NY', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '516': { state: 'New York', stateAbbr: 'NY', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '585': { state: 'New York', stateAbbr: 'NY', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '607': { state: 'New York', stateAbbr: 'NY', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '631': { state: 'New York', stateAbbr: 'NY', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '646': { state: 'New York', stateAbbr: 'NY', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '680': { state: 'New York', stateAbbr: 'NY', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '716': { state: 'New York', stateAbbr: 'NY', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '718': { state: 'New York', stateAbbr: 'NY', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '845': { state: 'New York', stateAbbr: 'NY', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '914': { state: 'New York', stateAbbr: 'NY', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '917': { state: 'New York', stateAbbr: 'NY', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '929': { state: 'New York', stateAbbr: 'NY', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '934': { state: 'New York', stateAbbr: 'NY', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },

  // Florida (ET)
  '239': { state: 'Florida', stateAbbr: 'FL', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '305': { state: 'Florida', stateAbbr: 'FL', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '321': { state: 'Florida', stateAbbr: 'FL', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '352': { state: 'Florida', stateAbbr: 'FL', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '386': { state: 'Florida', stateAbbr: 'FL', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '407': { state: 'Florida', stateAbbr: 'FL', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '561': { state: 'Florida', stateAbbr: 'FL', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '727': { state: 'Florida', stateAbbr: 'FL', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '754': { state: 'Florida', stateAbbr: 'FL', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '772': { state: 'Florida', stateAbbr: 'FL', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '786': { state: 'Florida', stateAbbr: 'FL', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '813': { state: 'Florida', stateAbbr: 'FL', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '850': { state: 'Florida', stateAbbr: 'FL', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '863': { state: 'Florida', stateAbbr: 'FL', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '904': { state: 'Florida', stateAbbr: 'FL', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '941': { state: 'Florida', stateAbbr: 'FL', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '954': { state: 'Florida', stateAbbr: 'FL', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },

  // Texas (CT)
  '210': { state: 'Texas', stateAbbr: 'TX', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '214': { state: 'Texas', stateAbbr: 'TX', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '254': { state: 'Texas', stateAbbr: 'TX', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '281': { state: 'Texas', stateAbbr: 'TX', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '325': { state: 'Texas', stateAbbr: 'TX', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '346': { state: 'Texas', stateAbbr: 'TX', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '361': { state: 'Texas', stateAbbr: 'TX', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '409': { state: 'Texas', stateAbbr: 'TX', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '430': { state: 'Texas', stateAbbr: 'TX', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '432': { state: 'Texas', stateAbbr: 'TX', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '469': { state: 'Texas', stateAbbr: 'TX', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '512': { state: 'Texas', stateAbbr: 'TX', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '682': { state: 'Texas', stateAbbr: 'TX', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '713': { state: 'Texas', stateAbbr: 'TX', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '737': { state: 'Texas', stateAbbr: 'TX', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '806': { state: 'Texas', stateAbbr: 'TX', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '817': { state: 'Texas', stateAbbr: 'TX', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '830': { state: 'Texas', stateAbbr: 'TX', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '832': { state: 'Texas', stateAbbr: 'TX', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '903': { state: 'Texas', stateAbbr: 'TX', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '915': { state: 'Texas', stateAbbr: 'TX', tzAbbr: 'MT', tzName: 'Mountain Time', timeZoneIdentifier: 'America/Denver' },
  '936': { state: 'Texas', stateAbbr: 'TX', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '940': { state: 'Texas', stateAbbr: 'TX', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '956': { state: 'Texas', stateAbbr: 'TX', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '972': { state: 'Texas', stateAbbr: 'TX', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '979': { state: 'Texas', stateAbbr: 'TX', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },

  // Illinois (CT)
  '217': { state: 'Illinois', stateAbbr: 'IL', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '224': { state: 'Illinois', stateAbbr: 'IL', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '309': { state: 'Illinois', stateAbbr: 'IL', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '312': { state: 'Illinois', stateAbbr: 'IL', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '331': { state: 'Illinois', stateAbbr: 'IL', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '618': { state: 'Illinois', stateAbbr: 'IL', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '630': { state: 'Illinois', stateAbbr: 'IL', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '708': { state: 'Illinois', stateAbbr: 'IL', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '773': { state: 'Illinois', stateAbbr: 'IL', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '815': { state: 'Illinois', stateAbbr: 'IL', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '847': { state: 'Illinois', stateAbbr: 'IL', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },
  '872': { state: 'Illinois', stateAbbr: 'IL', tzAbbr: 'CT', tzName: 'Central Time', timeZoneIdentifier: 'America/Chicago' },

  // Pennsylvania (ET)
  '215': { state: 'Pennsylvania', stateAbbr: 'PA', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '267': { state: 'Pennsylvania', stateAbbr: 'PA', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '272': { state: 'Pennsylvania', stateAbbr: 'PA', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '412': { state: 'Pennsylvania', stateAbbr: 'PA', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '484': { state: 'Pennsylvania', stateAbbr: 'PA', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '570': { state: 'Pennsylvania', stateAbbr: 'PA', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '610': { state: 'Pennsylvania', stateAbbr: 'PA', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '717': { state: 'Pennsylvania', stateAbbr: 'PA', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '724': { state: 'Pennsylvania', stateAbbr: 'PA', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '814': { state: 'Pennsylvania', stateAbbr: 'PA', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '878': { state: 'Pennsylvania', stateAbbr: 'PA', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },

  // Ohio (ET)
  '216': { state: 'Ohio', stateAbbr: 'OH', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '234': { state: 'Ohio', stateAbbr: 'OH', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '330': { state: 'Ohio', stateAbbr: 'OH', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '419': { state: 'Ohio', stateAbbr: 'OH', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '440': { state: 'Ohio', stateAbbr: 'OH', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '513': { state: 'Ohio', stateAbbr: 'OH', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '567': { state: 'Ohio', stateAbbr: 'OH', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '614': { state: 'Ohio', stateAbbr: 'OH', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '740': { state: 'Ohio', stateAbbr: 'OH', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '937': { state: 'Ohio', stateAbbr: 'OH', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },

  // Georgia (ET)
  '229': { state: 'Georgia', stateAbbr: 'GA', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '404': { state: 'Georgia', stateAbbr: 'GA', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '470': { state: 'Georgia', stateAbbr: 'GA', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '478': { state: 'Georgia', stateAbbr: 'GA', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '678': { state: 'Georgia', stateAbbr: 'GA', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '706': { state: 'Georgia', stateAbbr: 'GA', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '762': { state: 'Georgia', stateAbbr: 'GA', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '770': { state: 'Georgia', stateAbbr: 'GA', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '912': { state: 'Georgia', stateAbbr: 'GA', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },

  // North Carolina (ET)
  '252': { state: 'North Carolina', stateAbbr: 'NC', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '336': { state: 'North Carolina', stateAbbr: 'NC', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '704': { state: 'North Carolina', stateAbbr: 'NC', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '743': { state: 'North Carolina', stateAbbr: 'NC', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '828': { state: 'North Carolina', stateAbbr: 'NC', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '910': { state: 'North Carolina', stateAbbr: 'NC', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '919': { state: 'North Carolina', stateAbbr: 'NC', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '980': { state: 'North Carolina', stateAbbr: 'NC', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },
  '984': { state: 'North Carolina', stateAbbr: 'NC', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/New_York' },

  // Michigan (ET)
  '231': { state: 'Michigan', stateAbbr: 'MI', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/Detroit' },
  '248': { state: 'Michigan', stateAbbr: 'MI', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/Detroit' },
  '269': { state: 'Michigan', stateAbbr: 'MI', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/Detroit' },
  '313': { state: 'Michigan', stateAbbr: 'MI', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/Detroit' },
  '517': { state: 'Michigan', stateAbbr: 'MI', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/Detroit' },
  '586': { state: 'Michigan', stateAbbr: 'MI', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/Detroit' },
  '616': { state: 'Michigan', stateAbbr: 'MI', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/Detroit' },
  '734': { state: 'Michigan', stateAbbr: 'MI', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/Detroit' },
  '810': { state: 'Michigan', stateAbbr: 'MI', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/Detroit' },
  '906': { state: 'Michigan', stateAbbr: 'MI', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/Detroit' },
  '947': { state: 'Michigan', stateAbbr: 'MI', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/Detroit' },
  '989': { state: 'Michigan', stateAbbr: 'MI', tzAbbr: 'ET', tzName: 'Eastern Time', timeZoneIdentifier: 'America/Detroit' },

  // Washington (PT)
  '206': { state: 'Washington', stateAbbr: 'WA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '253': { state: 'Washington', stateAbbr: 'WA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '360': { state: 'Washington', stateAbbr: 'WA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '425': { state: 'Washington', stateAbbr: 'WA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '509': { state: 'Washington', stateAbbr: 'WA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '564': { state: 'Washington', stateAbbr: 'WA', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },

  // Arizona (MT)
  '480': { state: 'Arizona', stateAbbr: 'AZ', tzAbbr: 'MST', tzName: 'Mountain Time', timeZoneIdentifier: 'America/Phoenix' },
  '520': { state: 'Arizona', stateAbbr: 'AZ', tzAbbr: 'MST', tzName: 'Mountain Time', timeZoneIdentifier: 'America/Phoenix' },
  '602': { state: 'Arizona', stateAbbr: 'AZ', tzAbbr: 'MST', tzName: 'Mountain Time', timeZoneIdentifier: 'America/Phoenix' },
  '623': { state: 'Arizona', stateAbbr: 'AZ', tzAbbr: 'MST', tzName: 'Mountain Time', timeZoneIdentifier: 'America/Phoenix' },
  '928': { state: 'Arizona', stateAbbr: 'AZ', tzAbbr: 'MST', tzName: 'Mountain Time', timeZoneIdentifier: 'America/Phoenix' },

  // Colorado (MT)
  '303': { state: 'Colorado', stateAbbr: 'CO', tzAbbr: 'MT', tzName: 'Mountain Time', timeZoneIdentifier: 'America/Denver' },
  '719': { state: 'Colorado', stateAbbr: 'CO', tzAbbr: 'MT', tzName: 'Mountain Time', timeZoneIdentifier: 'America/Denver' },
  '720': { state: 'Colorado', stateAbbr: 'CO', tzAbbr: 'MT', tzName: 'Mountain Time', timeZoneIdentifier: 'America/Denver' },
  '970': { state: 'Colorado', stateAbbr: 'CO', tzAbbr: 'MT', tzName: 'Mountain Time', timeZoneIdentifier: 'America/Denver' },

  // Nevada (PT)
  '702': { state: 'Nevada', stateAbbr: 'NV', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '725': { state: 'Nevada', stateAbbr: 'NV', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' },
  '775': { state: 'Nevada', stateAbbr: 'NV', tzAbbr: 'PT', tzName: 'Pacific Time', timeZoneIdentifier: 'America/Los_Angeles' }
};

export interface PhoneLocationInfo {
  state: string;
  stateAbbr: string;
  tzAbbr: string;
  tzName: string;
  localTimeStr: string;
}

/**
 * Parses a phone number string and returns the State, Timezone, and Current Local Time
 */
export function getPhoneLocationAndTz(phone?: string | null): PhoneLocationInfo | null {
  if (!phone) return null;

  // Clean phone to digits
  const cleanDigits = phone.replace(/\D/g, '');
  let areaCode = '';

  if (cleanDigits.length === 11 && cleanDigits.startsWith('1')) {
    areaCode = cleanDigits.substring(1, 4);
  } else if (cleanDigits.length === 10) {
    areaCode = cleanDigits.substring(0, 3);
  }

  if (!areaCode || !AREA_CODE_MAP[areaCode]) {
    return null;
  }

  const info = AREA_CODE_MAP[areaCode];

  // Calculate local time in that timezone
  let localTimeStr = '';
  try {
    localTimeStr = new Date().toLocaleTimeString('en-US', {
      timeZone: info.timeZoneIdentifier,
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch (e) {
    localTimeStr = '';
  }

  return {
    state: info.state,
    stateAbbr: info.stateAbbr,
    tzAbbr: info.tzAbbr,
    tzName: info.tzName,
    localTimeStr
  };
}
