const usd = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });
const short = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

/** An amount in US dollars: "$1.20". */
export const money = (n: number) => usd.format(n);

/** A large number in few characters: "12K", "1.4M". */
export const compact = (n: number) => short.format(n);
