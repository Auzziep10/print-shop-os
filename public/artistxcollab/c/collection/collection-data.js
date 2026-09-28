// Sample data for the collection viewer. Replaced by the admin-managed
// Firestore collection once that is wired up; shape stays the same.
window.AXC_COLLECTION = {
  title: "Your Collection",
  // the room stays put; garments are transparent cutouts on the same 806x1760 canvas, hook at ~34% down
  background: "/artistxcollab/img/garments/room.webp",
  backgroundSize: [806, 1760],
  hookY: 0.34,
  garments: [
    {
      id: "sb-saints-after-dark",
      name: "Saints After Dark Tee",
      artist: "SantosBravos",
      image: "/artistxcollab/img/garments/sb-tee-cut.webp",
      imageSize: [806, 1760],
      story: "Built from light, drawn to trouble. A heavyweight enzyme-washed tee with a puff-ink manifesto at the chest and a hand-thrown splatter across the hem.",
      specs: [
        ["Fabric", "6.5 oz organic ring-spun cotton"],
        ["Fit", "Boxy, dropped shoulder"],
        ["Wash", "Enzyme pigment wash, charcoal"],
        ["Decoration", "Puff-ink screen print + hand splatter"],
        ["Ink", "Water-based, non-toxic"],
        ["Made in", "Los Angeles, CA"],
        ["Care", "Cold wash inside out, hang dry"]
      ],
      hotspots: [
        { x: 0.500, y: 0.432, label: "Chest manifesto — puff ink", image: "/artistxcollab/img/garments/sb-tee-chest.webp" },
        { x: 0.470, y: 0.590, label: "Hand splatter (sample closeup)", image: "/artistxcollab/img/garments/sb-tee-chest.webp" }
      ]
    },
    {
      id: "sample-2",
      name: "Sample Garment 02",
      artist: "Sample — replace in admin",
      image: "/artistxcollab/img/garments/sb-tee-cut.webp",
      imageSize: [806, 1760],
      story: "Placeholder so the carousel can be felt before real garments are uploaded.",
      specs: [["Fabric", "—"], ["Fit", "—"], ["Decoration", "—"]],
      hotspots: [{ x: 0.5, y: 0.432, label: "Sample closeup", image: "/artistxcollab/img/garments/sb-tee-chest.webp" }]
    },
    {
      id: "sample-3",
      name: "Sample Garment 03",
      artist: "Sample — replace in admin",
      image: "/artistxcollab/img/garments/sb-tee-cut.webp",
      imageSize: [806, 1760],
      story: "Placeholder so the carousel can be felt before real garments are uploaded.",
      specs: [["Fabric", "—"], ["Fit", "—"], ["Decoration", "—"]],
      hotspots: []
    }
  ]
};
