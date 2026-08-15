"use client";

import Link from "next/link";
import styles from "./error-surface.module.css";

interface ErrorPageProps {
  readonly error: Error & { digest?: string };
  readonly retry: () => void;
}

export default function ErrorPage({ retry }: ErrorPageProps) {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="error-title">
        <p className={styles.eyebrow}>Temporary problem</p>
        <h1 className={styles.title} id="error-title">
          Messaging could not load.
        </h1>
        <p className={styles.copy}>
          No message, wallet, purchase, or fulfillment details are shown on this
          error screen. Try the request again or return home.
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
  );
}
