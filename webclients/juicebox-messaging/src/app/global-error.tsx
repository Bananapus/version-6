"use client";

import Link from "next/link";
import styles from "./error-surface.module.css";

interface GlobalErrorPageProps {
  readonly error: Error & { digest?: string };
  readonly retry: () => void;
}

export default function GlobalErrorPage({ retry }: GlobalErrorPageProps) {
  return (
    <html lang="en">
      <body>
        <main className={styles.page}>
          <section className={styles.card} aria-labelledby="global-error-title">
            <p className={styles.eyebrow}>Service unavailable</p>
            <h1 className={styles.title} id="global-error-title">
              Messaging could not start.
            </h1>
            <p className={styles.copy}>
              Try again without sharing sensitive information. This screen never
              displays the underlying error or its diagnostic identifier.
            </p>
            <div className={styles.actions}>
              <button className={styles.action} type="button" onClick={retry}>
                Try again
              </button>
              <Link className={styles.secondaryAction} href="/">
                Return home
              </Link>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
