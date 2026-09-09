import COUNTRIES from "../../data/countries";

export default function CountryDatalist({ id }) {
  return (
    <datalist id={id}>
      {COUNTRIES.map((country) => (
        <option key={country} value={country} />
      ))}
    </datalist>
  );
}
