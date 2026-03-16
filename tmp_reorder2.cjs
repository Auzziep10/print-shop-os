import fs from 'fs';
let content = fs.readFileSync('src/pages/Orders/OrderDetail.tsx', 'utf8');

const artworkStartMarker = '          {/* Artwork & Mockups */}';
const artworkEndMarker = '        </div>\n\n        {/* Right Column: Activity & Assignees */}';
const targetStartMarker = '          {/* Activity Feed */}';

// We want to pull the Artwork section out of the left column (lg:col-span-2) completely.
// Currently it is inside the left column, before "Right Column: Activity ...".
// Wait, is it? Let me check line 246 above.
const garmentsStart = '          {/* Garments / Items */}';
// Earlier we moved Garments out. So what's left in Left Column? Just the abstract Header.
// And Artwork is still in the left column.

const artworkStart = content.indexOf(artworkStartMarker);
if (artworkStart === -1) {
  console.log("Could not find Artwork section");
  process.exit(1);
}

// And the end of Artwork section is closing the grid column... wait...
/*
          {/* Artwork & Mockups * /}
          <div>
            <div className="flex items-center justify-between mb-4">
               ...
            </div>
            ...
          </div>
        </div>

        {/* Right Column: Activity & Assignees * /}
*/
const nextSection = content.indexOf('        {/* Right Column: Activity & Assignees */}');
// We want to extract Artwork, and just cleanly remove it from the grid left col.
const artworkExtractionStr = content.slice(artworkStart, nextSection);
// It ends with \n        </div>\n\n depending on how it's formatted.
// Let's remove the "</div>" which closes the left col from artworkExtractionStr.
// It should be the last closing div.

// The index of the very last `        </div>\n` inside artworkExtractionStr
const lastClosingDiv = artworkExtractionStr.lastIndexOf('        </div>');

let cleanArtworkBlock = artworkExtractionStr.slice(0, lastClosingDiv);
const remainderBeforeRightCol = artworkExtractionStr.slice(lastClosingDiv);

// So we take artwork out.
const part1 = content.slice(0, artworkStart);
const part2 = content.slice(nextSection); // this will leave remainderBeforeRightCol missing... let's just piece it.

const contentWithoutArtwork = part1 + remainderBeforeRightCol + part2;

// Now find where to insert Artwork: between Garments and Activity in the new bottom stack.
const activityMarker = '          {/* Activity Feed */}';
const actStart = contentWithoutArtwork.indexOf(activityMarker);

const finalContent = contentWithoutArtwork.slice(0, actStart) + cleanArtworkBlock + '\n' + contentWithoutArtwork.slice(actStart);

fs.writeFileSync('src/pages/Orders/OrderDetail.tsx', finalContent);
console.log('Artwork moved successfully');
