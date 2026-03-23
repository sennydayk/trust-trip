interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
}

export default function PageContainer({ children, className = '' }: PageContainerProps) {
  return (
    <div className={`mx-auto max-w-[1200px] px-4 py-5 ${className}`}>
      {children}
    </div>
  );
}
