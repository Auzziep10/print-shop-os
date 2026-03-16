import fs from 'fs';
let content = fs.readFileSync('src/pages/Orders/OrderDetail.tsx', 'utf8');

const artworkStartMarker = '          {/* Artwork & Mockups */}';
const targetStartMarker = '          {/* Activity Feed */}';

const artworkStart = content.indexOf(artworkStartMarker);
if (artworkStart === -1) {
  console.log("Could not find Artwork section");
  process.exit(1);
}

// Find the end of the Artwork section.
// It sits right before: "        </div>\n      </div>\n\n      <div className=\"space-y-8 mt-8\">"
const endOfArtworkSearchMarker = '        </div>\n      </div>\n\n      <div className="space-y-8 mt-8">';
const endOfArtwork = content.indexOf(endOfArtworkSearchMarker);

const artworkSection = content.slice(artworkStart, endOfArtwork);

// We need to verify what follows Artwork. Previously it was:
/*
          {/* Artwork & Mockups * /}
          <div>
            ...
          </div>
        </div>
        
        {/* Right Column: Activity & Assignees * /}
*/
// But no, I ALREADY moved the grid constraints earlier!
// In the current file, where is Artwork & Mockups positioned? Oh wait, earlier my script didn't touch Artwork layout.
// So Artwork is exactly at index2 which was:
// const artworkPart = content.substring(index2, index3);
// Where index3 is '{/* Right Column: Activity & Assignees */}'.

// Let's just find the current limits:
const rightColStart = content.indexOf('        {/* Right Column: Activity & Assignees */}');
let rawArtworkBlock = content.slice(artworkStart, rightColStart);

// Remove the `        </div>\n` closing tag that belongs to the Left Column from rawArtworkBlock
const closingTagIndex = rawArtworkBlock.lastIndexOf('        </div>');
let cleanArtworkBlock = rawArtworkBlock.slice(0, closingTagIndex);
let remainingDivs = rawArtworkBlock.slice(closingTagIndex);

const part1 = content.slice(0, artworkStart);
const contentWithoutArtwork = part1 + remainingDivs + content.slice(rightColStart);

const activityMarker = '          {/* Activity Feed */}';
const actStart = contentWithoutArtwork.indexOf(activityMarker);

const finalContent = contentWithoutArtwork.slice(0, actStart) + cleanArtworkBlock + '\n' + contentWithoutArtwork.slice(actStart);

fs.writeFileSync('src/pages/Orders/OrderDetail.tsx', finalContent);
console.log('Artwork moved successfully');
