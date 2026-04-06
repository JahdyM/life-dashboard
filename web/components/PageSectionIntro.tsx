export default function PageSectionIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <section className="page-intro">
      {eyebrow ? <p className="page-intro-eyebrow">{eyebrow}</p> : null}
      <h2>{title}</h2>
      {description ? <p className="page-intro-copy">{description}</p> : null}
    </section>
  );
}
