import Link from "next/link";
import styles from "./error-surface.module.css";

export default function NotFound() {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="not-found-title">
        <p className={styles.eyebrow}>404 · Not found</p>
        <h1 className={styles.title} id="not-found-title">
          This page is not available.
        </h1>
        <p className={styles.copy}>
          Check the address or return to the first-party messaging client.
        </p>
        <div className={styles.actions}>
          <Link className={styles.action} href="/">
            Return to messaging
          </Link>
        </div>
      </section>
    </main>
  );
}
