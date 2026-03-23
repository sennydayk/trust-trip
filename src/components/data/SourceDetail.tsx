interface DetailItem {
  label: string;
  value: string | number;
  highlight?: boolean;
}

interface SourceDetailProps {
  title: string;
  icon?: React.ReactNode;
  items: DetailItem[];
}

export default function SourceDetail({ title, icon, items }: SourceDetailProps) {
  return (
    <div className="bg-neutral-surface rounded p-3.5">
      <div className="flex items-center gap-2 mb-2.5">
        {icon && <span className="text-neutral-mid">{icon}</span>}
        <p className="text-xs font-semibold text-neutral-light uppercase tracking-[0.5px]">
          {title}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between">
            <span className="text-xs text-neutral-mid">{item.label}</span>
            <span
              className={`text-xs font-medium ${
                item.highlight ? 'text-primary' : 'text-neutral-dark'
              }`}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
