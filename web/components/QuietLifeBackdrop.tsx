export default function QuietLifeBackdrop() {
  return (
    <div className="quiet-life-backdrop" aria-hidden="true">
      <span className="quiet-life-wash quiet-life-wash-amber" />
      <span className="quiet-life-wash quiet-life-wash-moss" />

      <svg
        className="quiet-life-branch"
        viewBox="0 0 520 310"
        role="presentation"
      >
        <path className="quiet-life-ink" d="M528 28C430 45 356 86 282 141c-69 51-128 76-229 94" />
        <path className="quiet-life-twig" d="M420 62c-10 53-32 94-68 125M333 111c-8-37-2-69 14-100M258 159c-33-16-66-19-100-10M187 196c-5 39-21 72-48 101" />
        <g className="quiet-life-leaves">
          <path d="M401 92c-42-9-62 8-57 47 38 4 60-11 57-47Z" />
          <path d="M355 47c-13-35-37-43-70-21 14 32 39 41 70 21Z" />
          <path d="M313 136c-42-2-59 19-47 57 38-3 57-23 47-57Z" />
          <path d="M248 151c-26-31-53-31-79 0 26 27 52 28 79 0Z" />
          <path d="M208 202c-40 1-55 23-40 59 36-6 52-27 40-59Z" />
          <path d="M132 208c-25-30-51-29-77 2 25 26 51 26 77-2Z" />
        </g>
        <g className="quiet-life-acorns">
          <path d="M455 81c15-7 31 5 29 21-2 16-21 34-26 38-4-5-17-29-12-44 2-7 5-12 9-15Z" />
          <path d="M446 89c11 5 26 3 36-5" />
          <path d="M289 190c13-6 27 4 26 18-2 14-18 29-22 33-4-5-15-25-11-38 1-6 4-10 7-13Z" />
          <path d="M282 197c10 4 23 3 31-5" />
        </g>
      </svg>

      <svg
        className="quiet-life-desk-scene"
        viewBox="0 0 560 310"
        role="presentation"
      >
        <path className="quiet-life-desk-line" d="M12 264h536" />
        <g className="quiet-life-books">
          <path d="M30 216h190v46H30z" />
          <path d="M48 169h194v45H48z" />
          <path d="M24 123h181v44H24z" />
          <path d="M52 133h10M64 179h12M48 227h12" />
        </g>
        <g className="quiet-life-mug">
          <path d="M320 167h111v88c0 6-5 10-11 10h-89c-6 0-11-4-11-10v-88Z" />
          <path d="M432 183h16c37 0 37 55 0 55h-16" />
          <path d="M348 145c-19-21 16-28-1-50M382 145c-19-21 17-28 0-50M415 145c-18-21 17-28 0-50" />
          <path d="M349 202c18-14 38-14 57 0-18 22-38 22-57 0Z" />
        </g>
        <g className="quiet-life-leaf-sprig">
          <path d="M480 254c2-55 14-103 47-145" />
          <path d="M505 146c-28-9-41 3-38 31 26 5 39-6 38-31ZM517 125c1-27 15-38 41-30-3 24-16 35-41 30ZM492 184c-29-7-41 7-35 34 26 3 38-10 35-34Z" />
        </g>
      </svg>
    </div>
  );
}
