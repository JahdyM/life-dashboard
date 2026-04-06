export default function PageSectionIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <section className="page-intro">
      <p className="page-intro-eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p className="page-intro-copy">{description}</p>
    </section>
  );
}
