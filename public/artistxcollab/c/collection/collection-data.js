// Sample data for the collection viewer — used only until garments exist in
// Settings → Artist×Collab (Firestore `axc_garments`). Same shape as the live data.
window.AXC_COLLECTION = {
  title: "Your Collection",
  // the room stays put; garments are transparent cutouts on the same canvas, hook at ~34% down
  background: "/artistxcollab/img/garments/room.webp",
  backgroundSize: [852, 1847],
  backgroundWide: "/artistxcollab/img/garments/room-wide.webp",   // same room with the wall extended sideways for short/wide phone viewports
  backgroundWideSize: [1400, 1847],
  hangerImage: "/artistxcollab/img/garments/hanger.png",   // the hanger lifted from the original render (170x130 on the 806px reference canvas)
  hookY: 0.34,           // where the hanger hook hangs, as a fraction of the room height (just under the sign)
  garmentWidth: 0.32,    // every garment is scaled to this width, as a fraction of the room height
  garments: [
    {
      id: "sb-saints-after-dark",
      name: "Saints After Dark Tee",
      artist: "SantosBravos",
      front: { url: "/artistxcollab/img/garments/sb-tee-garment.webp", width: 541, height: 565 },
      back: null,
      neck: { cx: 0.5, cy: 0.045, rx: 0.1, ry: 0.035 },
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
      closeups: [
        { label: "Art 1", image: "/artistxcollab/img/garments/sb-tee-chest.webp" },
        { label: "Art 2", image: "/artistxcollab/img/garments/sb-tee-chest.webp" },
        { label: "Fabric", image: "/artistxcollab/img/garments/sb-tee-chest.webp" },
        { label: "Neck", image: "/artistxcollab/img/garments/sb-tee-chest.webp" }
      ]
    },
    {
      id: "sample-2",
      name: "Sample Garment 02",
      artist: "Sample — replace in admin",
      front: { url: "/artistxcollab/img/garments/sb-tee-garment.webp", width: 541, height: 565 },
      back: { url: "/artistxcollab/img/garments/sb-tee-garment.webp", width: 541, height: 565 },   // placeholder back so the Turn control can be tried
      story: "Placeholder so the carousel can be felt before real garments are uploaded.",
      specs: [["Fabric", "—"], ["Fit", "—"], ["Decoration", "—"]],
      closeups: [{ label: "Art 1", image: "/artistxcollab/img/garments/sb-tee-chest.webp" }]
    },
    {
      id: "sample-3",
      name: "Sample Garment 03",
      artist: "Sample — replace in admin",
      front: { url: "/artistxcollab/img/garments/sb-tee-garment.webp", width: 541, height: 565 },
      back: null,
      story: "Placeholder so the carousel can be felt before real garments are uploaded.",
      specs: [["Fabric", "—"], ["Fit", "—"], ["Decoration", "—"]],
      closeups: []
    }
  ]
};

// Firebase project the live garments are read from (public web config; reads are rule-limited).
window.AXC_FIREBASE = {
  apiKey: "AIzaSyAGiJrWnwbdY4PrI-YHMf7DWOS9wFlsY3c",
  authDomain: "print-shop-os-f8092.firebaseapp.com",
  projectId: "print-shop-os-f8092",
  storageBucket: "print-shop-os-f8092.firebasestorage.app",
  messagingSenderId: "637868552650",
  appId: "1:637868552650:web:473f9f71ad41703ec7df33"
};
