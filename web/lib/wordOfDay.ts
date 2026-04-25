export type WordOfDayTag =
  | "astronomy"
  | "astrophysics"
  | "space systems"
  | "planetary science"
  | "physics"
  | "research"
  | "mathematics"
  | "materials"
  | "earth observation"
  | "books"
  | "writing"
  | "faith"
  | "daily life";

export type WordOfDayItem = {
  word: string;
  pronunciation: string;
  meaning: string;
  example: string;
  tag: WordOfDayTag;
};

const WORD_POOL: WordOfDayItem[] = [
  {
    word: "albedo",
    pronunciation: "/al-BEE-doh/",
    meaning: "the fraction of light reflected by a surface",
    example: "Fresh snow has high albedo, so it sends much sunlight back to space.",
    tag: "planetary science",
  },
  {
    word: "apogee",
    pronunciation: "/AP-uh-jee/",
    meaning: "the farthest point in an orbit around Earth",
    example: "The satellite reaches apogee before falling back toward perigee.",
    tag: "astronomy",
  },
  {
    word: "perigee",
    pronunciation: "/PAIR-uh-jee/",
    meaning: "the closest point in an orbit around Earth",
    example: "The spacecraft moved fastest near perigee.",
    tag: "astronomy",
  },
  {
    word: "perihelion",
    pronunciation: "/pair-ih-HEE-lee-un/",
    meaning: "the closest point in an orbit around the Sun",
    example: "A comet brightens as it approaches perihelion.",
    tag: "astronomy",
  },
  {
    word: "aphelion",
    pronunciation: "/af-EE-lee-un/",
    meaning: "the farthest point in an orbit around the Sun",
    example: "At aphelion, the probe received less solar energy.",
    tag: "astronomy",
  },
  {
    word: "precession",
    pronunciation: "/pree-SESH-un/",
    meaning: "a slow change in the orientation of a rotating body",
    example: "Axial precession gently changes the direction of Earth's pole.",
    tag: "astrophysics",
  },
  {
    word: "ecliptic",
    pronunciation: "/ih-KLIP-tik/",
    meaning: "the apparent path of the Sun across the sky",
    example: "The planets stay close to the ecliptic.",
    tag: "astronomy",
  },
  {
    word: "zenith",
    pronunciation: "/ZEE-nith/",
    meaning: "the point directly overhead",
    example: "The telescope tracked a star near zenith.",
    tag: "astronomy",
  },
  {
    word: "nadir",
    pronunciation: "/NAY-deer/",
    meaning: "the point directly below an observer",
    example: "Earth-observing instruments often point toward nadir.",
    tag: "earth observation",
  },
  {
    word: "parallax",
    pronunciation: "/PAIR-uh-laks/",
    meaning: "an apparent shift caused by a change in viewpoint",
    example: "Astronomers use parallax to estimate stellar distance.",
    tag: "astrophysics",
  },
  {
    word: "redshift",
    pronunciation: "/RED-shift/",
    meaning: "the stretching of light toward longer wavelengths",
    example: "Redshift helps estimate how fast a galaxy recedes.",
    tag: "astrophysics",
  },
  {
    word: "blueshift",
    pronunciation: "/BLOO-shift/",
    meaning: "the compression of light toward shorter wavelengths",
    example: "Blueshift can reveal motion toward the observer.",
    tag: "astrophysics",
  },
  {
    word: "spectroscopy",
    pronunciation: "/spek-TRAH-skuh-pee/",
    meaning: "the study of matter through its interaction with light",
    example: "Spectroscopy revealed sodium in the exoplanet atmosphere.",
    tag: "astrophysics",
  },
  {
    word: "photometry",
    pronunciation: "/foh-TAH-muh-tree/",
    meaning: "the measurement of light intensity",
    example: "Photometry showed a small dip during the transit.",
    tag: "astrophysics",
  },
  {
    word: "transit",
    pronunciation: "/TRAN-zit/",
    meaning: "the passage of one body in front of another",
    example: "A transit can make a distant star appear slightly dimmer.",
    tag: "planetary science",
  },
  {
    word: "occultation",
    pronunciation: "/ah-kul-TAY-shun/",
    meaning: "the hiding of one object behind another",
    example: "A lunar occultation briefly concealed the star.",
    tag: "astronomy",
  },
  {
    word: "limb",
    pronunciation: "/lim/",
    meaning: "the visible edge of a celestial body",
    example: "The solar limb shimmered through the filter.",
    tag: "astronomy",
  },
  {
    word: "terminator",
    pronunciation: "/TUR-muh-nay-ter/",
    meaning: "the boundary between day and night on a planet or moon",
    example: "Craters are easiest to see near the lunar terminator.",
    tag: "planetary science",
  },
  {
    word: "regolith",
    pronunciation: "/REG-uh-lith/",
    meaning: "loose rock and dust covering solid planetary surfaces",
    example: "The rover wheels left delicate tracks in the regolith.",
    tag: "planetary science",
  },
  {
    word: "cryosphere",
    pronunciation: "/KRY-oh-sfeer/",
    meaning: "the frozen water parts of a planetary system",
    example: "Satellites monitor seasonal changes in the cryosphere.",
    tag: "earth observation",
  },
  {
    word: "magnetosphere",
    pronunciation: "/mag-NEE-tuh-sfeer/",
    meaning: "the region controlled by a planet's magnetic field",
    example: "Jupiter's magnetosphere is vast and energetic.",
    tag: "planetary science",
  },
  {
    word: "heliosphere",
    pronunciation: "/HEE-lee-oh-sfeer/",
    meaning: "the bubble shaped by solar wind around the Sun",
    example: "Voyager crossed the outer edge of the heliosphere.",
    tag: "astrophysics",
  },
  {
    word: "ionosphere",
    pronunciation: "/eye-AH-nuh-sfeer/",
    meaning: "an ionized layer of the upper atmosphere",
    example: "Solar storms can disturb the ionosphere.",
    tag: "earth observation",
  },
  {
    word: "exosphere",
    pronunciation: "/EK-soh-sfeer/",
    meaning: "the outermost layer of an atmosphere",
    example: "Particles in the exosphere can escape into space.",
    tag: "planetary science",
  },
  {
    word: "ephemeris",
    pronunciation: "/ih-FEM-er-is/",
    meaning: "a table or model of celestial positions over time",
    example: "The mission team updated the ephemeris before tracking.",
    tag: "space systems",
  },
  {
    word: "telemetry",
    pronunciation: "/tuh-LEM-uh-tree/",
    meaning: "measurements sent remotely from an instrument or vehicle",
    example: "Telemetry confirmed the spacecraft was healthy.",
    tag: "space systems",
  },
  {
    word: "attitude",
    pronunciation: "/AT-ih-tood/",
    meaning: "a spacecraft's orientation in space",
    example: "The attitude control system kept the antenna pointed home.",
    tag: "space systems",
  },
  {
    word: "slew",
    pronunciation: "/sloo/",
    meaning: "to rotate a spacecraft or telescope toward a target",
    example: "The observatory will slew to the galaxy after sunset.",
    tag: "space systems",
  },
  {
    word: "delta-v",
    pronunciation: "/DEL-tuh vee/",
    meaning: "the velocity change needed for a maneuver",
    example: "The transfer orbit required a precise delta-v budget.",
    tag: "space systems",
  },
  {
    word: "inclination",
    pronunciation: "/in-kluh-NAY-shun/",
    meaning: "the tilt of an orbit relative to a reference plane",
    example: "A polar orbit has high inclination.",
    tag: "space systems",
  },
  {
    word: "eccentricity",
    pronunciation: "/ek-sen-TRIS-ih-tee/",
    meaning: "how much an orbit departs from a circle",
    example: "The asteroid has a highly eccentric orbit.",
    tag: "astronomy",
  },
  {
    word: "resonance",
    pronunciation: "/REZ-uh-nuns/",
    meaning: "a repeated gravitational rhythm between orbiting bodies",
    example: "Orbital resonance shapes the gaps in Saturn's rings.",
    tag: "astrophysics",
  },
  {
    word: "libration",
    pronunciation: "/ly-BRAY-shun/",
    meaning: "a slight apparent rocking motion of the Moon",
    example: "Libration lets us glimpse a little beyond the lunar edge.",
    tag: "astronomy",
  },
  {
    word: "azimuth",
    pronunciation: "/AZ-uh-muth/",
    meaning: "horizontal direction measured around the horizon",
    example: "The observer recorded altitude and azimuth.",
    tag: "astronomy",
  },
  {
    word: "altitude",
    pronunciation: "/AL-tih-tood/",
    meaning: "angular height above the horizon",
    example: "The planet reached high altitude before midnight.",
    tag: "astronomy",
  },
  {
    word: "isophote",
    pronunciation: "/EYE-soh-foht/",
    meaning: "a line connecting points of equal brightness",
    example: "The isophotes traced the galaxy's faint outer disk.",
    tag: "astrophysics",
  },
  {
    word: "PSF",
    pronunciation: "/pee ess eff/",
    meaning: "point spread function, the image pattern of a point source",
    example: "A cleaner PSF improved the star measurements.",
    tag: "research",
  },
  {
    word: "signal-to-noise",
    pronunciation: "/SIG-nul tuh noyz/",
    meaning: "the strength of a signal compared with background noise",
    example: "Longer exposure raised the signal-to-noise ratio.",
    tag: "research",
  },
  {
    word: "calibration",
    pronunciation: "/kal-ih-BRAY-shun/",
    meaning: "adjustment against a known standard",
    example: "Calibration turned raw detector counts into useful data.",
    tag: "research",
  },
  {
    word: "uncertainty",
    pronunciation: "/un-SUR-tun-tee/",
    meaning: "a quantified range of possible error",
    example: "Every measurement carried a stated uncertainty.",
    tag: "research",
  },
  {
    word: "baseline",
    pronunciation: "/BAYS-line/",
    meaning: "a reference level used for comparison",
    example: "The quiet baseline made the flare easier to detect.",
    tag: "research",
  },
  {
    word: "residual",
    pronunciation: "/ri-ZIJ-oo-ul/",
    meaning: "the difference between observed and modeled values",
    example: "Small residuals suggested the model fit well.",
    tag: "mathematics",
  },
  {
    word: "covariance",
    pronunciation: "/koh-VAIR-ee-uns/",
    meaning: "a measure of how two quantities vary together",
    example: "The covariance matrix captured correlated errors.",
    tag: "mathematics",
  },
  {
    word: "Bayesian",
    pronunciation: "/BAY-zee-un/",
    meaning: "using probability to update belief with evidence",
    example: "A Bayesian model folded prior knowledge into the estimate.",
    tag: "mathematics",
  },
  {
    word: "posterior",
    pronunciation: "/pah-STEER-ee-er/",
    meaning: "the probability distribution after evidence is included",
    example: "The posterior narrowed after new observations.",
    tag: "mathematics",
  },
  {
    word: "likelihood",
    pronunciation: "/LYE-klee-hood/",
    meaning: "how well a model explains observed data",
    example: "The best parameter set maximized the likelihood.",
    tag: "mathematics",
  },
  {
    word: "gradient",
    pronunciation: "/GRAY-dee-unt/",
    meaning: "a rate of change across space or variables",
    example: "The temperature gradient hinted at buried ice.",
    tag: "mathematics",
  },
  {
    word: "anisotropy",
    pronunciation: "/an-eye-SAHT-ruh-pee/",
    meaning: "direction-dependent behavior or structure",
    example: "Cosmic microwave anisotropy preserves early-universe clues.",
    tag: "astrophysics",
  },
  {
    word: "isotropy",
    pronunciation: "/eye-SAHT-ruh-pee/",
    meaning: "similar properties in every direction",
    example: "Large-scale isotropy is a key cosmological assumption.",
    tag: "astrophysics",
  },
  {
    word: "luminosity",
    pronunciation: "/loo-muh-NAH-sih-tee/",
    meaning: "the total power emitted as light",
    example: "A star's luminosity depends on size and temperature.",
    tag: "astrophysics",
  },
  {
    word: "accretion",
    pronunciation: "/uh-KREE-shun/",
    meaning: "growth by gradual gathering of material",
    example: "Accretion disks can feed black holes.",
    tag: "astrophysics",
  },
  {
    word: "photosphere",
    pronunciation: "/FOH-toh-sfeer/",
    meaning: "the visible surface layer of a star",
    example: "Sunspots appear in the photosphere.",
    tag: "astrophysics",
  },
  {
    word: "chromosphere",
    pronunciation: "/KROH-muh-sfeer/",
    meaning: "a stellar atmospheric layer above the photosphere",
    example: "The chromosphere glowed red during the eclipse.",
    tag: "astrophysics",
  },
  {
    word: "corona",
    pronunciation: "/kuh-ROH-nuh/",
    meaning: "the outer atmosphere of a star",
    example: "The solar corona became visible at totality.",
    tag: "astrophysics",
  },
  {
    word: "granulation",
    pronunciation: "/gran-yoo-LAY-shun/",
    meaning: "cell-like texture from convective motion",
    example: "Solar granulation revealed hot plasma rising.",
    tag: "astrophysics",
  },
  {
    word: "bolometer",
    pronunciation: "/boh-LAH-muh-ter/",
    meaning: "an instrument that measures radiant energy",
    example: "The bolometer detected faint thermal emission.",
    tag: "space systems",
  },
  {
    word: "interferometry",
    pronunciation: "/in-ter-fuh-RAH-muh-tree/",
    meaning: "combining waves to make precise measurements",
    example: "Interferometry sharpened the view of the star-forming region.",
    tag: "space systems",
  },
  {
    word: "aperture",
    pronunciation: "/AP-er-chur/",
    meaning: "an opening that collects light",
    example: "A larger aperture gathered more photons.",
    tag: "space systems",
  },
  {
    word: "diffraction",
    pronunciation: "/dih-FRAK-shun/",
    meaning: "wave bending around edges or through openings",
    example: "Diffraction set a limit on image sharpness.",
    tag: "physics",
  },
  {
    word: "polarimetry",
    pronunciation: "/poh-luh-RIM-uh-tree/",
    meaning: "measurement of light polarization",
    example: "Polarimetry helped map magnetic fields in dust clouds.",
    tag: "astrophysics",
  },
  {
    word: "epoxy",
    pronunciation: "/ih-PAHK-see/",
    meaning: "a strong resin used for bonding or coating",
    example: "Space hardware used low-outgassing epoxy.",
    tag: "materials",
  },
  {
    word: "outgassing",
    pronunciation: "/OWT-gas-ing/",
    meaning: "release of trapped gas from a material",
    example: "Engineers tested outgassing before launch.",
    tag: "materials",
  },
  {
    word: "annealing",
    pronunciation: "/uh-NEEL-ing/",
    meaning: "heating and cooling to change material properties",
    example: "Annealing reduced stress in the detector substrate.",
    tag: "materials",
  },
  {
    word: "composite",
    pronunciation: "/kum-PAH-zit/",
    meaning: "a material made from two or more constituents",
    example: "The boom used a light carbon-fiber composite.",
    tag: "materials",
  },
  {
    word: "redundancy",
    pronunciation: "/ri-DUN-dun-see/",
    meaning: "backup capacity built into a system",
    example: "Redundancy kept the mission safe after a sensor failed.",
    tag: "space systems",
  },
  {
    word: "fault tree",
    pronunciation: "/fawlt tree/",
    meaning: "a diagram for tracing possible failure causes",
    example: "The team used a fault tree before the readiness review.",
    tag: "space systems",
  },
  {
    word: "margin",
    pronunciation: "/MAR-jin/",
    meaning: "reserve capacity beyond the expected need",
    example: "Good power margin made the design calmer.",
    tag: "space systems",
  },
  {
    word: "prototype",
    pronunciation: "/PROH-tuh-type/",
    meaning: "an early model used for testing ideas",
    example: "A prototype revealed the handling issue before fabrication.",
    tag: "research",
  },
  {
    word: "hypothesis",
    pronunciation: "/hy-PAH-thuh-sis/",
    meaning: "a testable explanation",
    example: "The observation refined her hypothesis.",
    tag: "research",
  },
  {
    word: "methodology",
    pronunciation: "/meth-uh-DAH-luh-jee/",
    meaning: "the organized approach behind a study",
    example: "A clear methodology made the result easier to trust.",
    tag: "research",
  },
  {
    word: "notebook",
    pronunciation: "/NOHT-book/",
    meaning: "a structured record of observations and decisions",
    example: "Her notebook held the quiet logic of the experiment.",
    tag: "books",
  },
  {
    word: "annotation",
    pronunciation: "/an-uh-TAY-shun/",
    meaning: "a note that clarifies data, text, or context",
    example: "A careful annotation saved the figure from confusion.",
    tag: "writing",
  },
  {
    word: "synthesis",
    pronunciation: "/SIN-thuh-sis/",
    meaning: "the combining of parts into a coherent whole",
    example: "The chapter became a synthesis of data and reflection.",
    tag: "writing",
  },
  {
    word: "discernment",
    pronunciation: "/dih-SURN-munt/",
    meaning: "careful judgment about what matters",
    example: "Discernment helped her choose the next experiment.",
    tag: "faith",
  },
  {
    word: "attune",
    pronunciation: "/uh-TOON/",
    meaning: "to bring into harmony with a rhythm or setting",
    example: "She attuned her plan to the quiet pace of the lab.",
    tag: "daily life",
  },
  {
    word: "lucid",
    pronunciation: "/LOO-sid/",
    meaning: "clear in thought, expression, or understanding",
    example: "A lucid note made tomorrow's analysis easier.",
    tag: "writing",
  },
  {
    word: "steadfast",
    pronunciation: "/STED-fast/",
    meaning: "firm and consistent in purpose",
    example: "A steadfast routine carried the research through low-energy days.",
    tag: "faith",
  },
];

function toDateKey(dateIso?: string) {
  return dateIso || new Date().toISOString().slice(0, 10);
}

function dayNumberFromIso(dateIso: string) {
  const [yearText, monthText, dayText] = dateIso.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!year || !month || !day) return 0;
  const utc = Date.UTC(year, month - 1, day);
  return Math.floor(utc / 86_400_000);
}

function stableIndexForDay(dayNumber: number) {
  return Math.abs((dayNumber * 37 + Math.floor(dayNumber / 11) * 17) % WORD_POOL.length);
}

export function getWordPoolSize() {
  return WORD_POOL.length;
}

export function getWordOfTheDay(dateIso?: string): WordOfDayItem {
  const key = toDateKey(dateIso);
  const dayNumber = dayNumberFromIso(key);
  return WORD_POOL[stableIndexForDay(dayNumber)];
}
