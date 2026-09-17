import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact the Imagine founding team about teacher beta testing for Imaginev1."
};

const contacts = [
  {
    name: "Krish Sapovadia",
    email: "kcsapovadia@gmail.com",
    href: "mailto:kcsapovadia@gmail.com"
  },
  {
    name: "Vivaan Grover",
    email: "vpvpgrover09@gmail.com",
    href: "mailto:vpvpgrover09@gmail.com"
  },
  {
    name: "Jackson Bizell",
    email: "jbizell09@gmail.com",
    href: "mailto:jbizell09@gmail.com"
  }
];

export default function ContactPage() {
  return (
    <main id="main-content">
      <section className="marketing-shell marketing-page-hero contact-hero">
        <div>
          <h1 data-hero>Help test Imaginev1 in the classroom.</h1>
        </div>
        <div className="marketing-page-hero-note" data-hero>
          <p>
            We’re inviting teachers to beta test the current classroom
            experience and share direct feedback with the founding team.
          </p>
        </div>
      </section>

      <section
        className="marketing-shell marketing-section marketing-contact"
        aria-labelledby="contact-team-title"
      >
        <header data-reveal>
          <h2 id="contact-team-title">Start a conversation with the team.</h2>
          <p>
            Tell us what you teach, the classroom setting you have in mind, and
            what you would want to evaluate during a beta test.
          </p>
        </header>
        <address data-reveal>
          {contacts.map((contact) => (
            <a key={contact.email} href={contact.href}>
              <span>{contact.name}</span>
              <strong>{contact.email}</strong>
            </a>
          ))}
        </address>
      </section>
    </main>
  );
}
