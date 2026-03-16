import fs from 'fs';
let content = fs.readFileSync('src/pages/Orders/OrderDetail.tsx', 'utf8');

const index1 = content.indexOf('          {/* Garments / Items */}');
const index2 = content.indexOf('          {/* Artwork & Mockups */}');
const index3 = content.indexOf('        {/* Right Column: Activity & Assignees */}');
const index4 = content.indexOf('          {/* Team Assignment */}');
const index5 = content.indexOf('          {/* Activity Feed */}');
const index6 = content.indexOf('      {/* Edit Order Dialog */}');

if ([index1, index2, index3, index4, index5, index6].includes(-1)) {
  console.log('Error finding indices');
  process.exit(1);
}

const headerPart = content.substring(0, index1);
const garmentsPart = content.substring(index1, index2);
const artworkPart = content.substring(index2, index3);
const teamPart = content.substring(index3, index5);
let activityPart = content.substring(index5, index6);

// Extract the exact closing div for activity array
const actEndMarker = '        </div>\n      </div>\n\n';
if (activityPart.endsWith(actEndMarker)) {
  activityPart = activityPart.substring(0, activityPart.length - actEndMarker.length);
}

// Remove the height restriction from Activity Feed to allow it to expand organically
activityPart = activityPart.replace('h-[500px]', '');

// Reassemble
const newContent = headerPart +
  artworkPart +
  teamPart +
  '        </div>\n' +
  '      </div>\n\n' +
  '      <div className="space-y-8 mt-8">\n' +
  garmentsPart +
  activityPart +
  '      </div>\n\n' +
  '      {/* Edit Order Dialog */}\n' +
  content.substring(index6 + '      {/* Edit Order Dialog */}'.length + 1);

fs.writeFileSync('src/pages/Orders/OrderDetail.tsx', newContent, 'utf8');
console.log('Reordered successfully!');
