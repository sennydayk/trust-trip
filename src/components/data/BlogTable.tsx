import AdTag from '@/components/score/AdTag';
import type { FinalVerdict } from '@/lib/analyzers/ad-detector';

interface BlogRow {
  url: string;
  title: string;
  verdict: FinalVerdict;
  reason: string;
  sentiment?: number;
}

interface BlogTableProps {
  posts: BlogRow[];
}

function isRealUrl(url: string): boolean {
  if (!url) return false;
  if (url.includes('/sim_')) return false;
  if (url.includes('blog.naver.com')) return /blog\.naver\.com\/[a-zA-Z0-9_]+\/\d+/.test(url);
  return url.startsWith('http');
}

export default function BlogTable({ posts }: BlogTableProps) {
  if (posts.length === 0) {
    return (
      <div className="bg-neutral-surface rounded p-3 text-center text-xs text-neutral-light">
        블로그 데이터 없음
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-neutral-border">
            <th className="py-2 pr-2 text-left text-xs font-semibold text-neutral-light uppercase tracking-[0.5px] w-14">
              판정
            </th>
            <th className="py-2 px-2 text-left text-xs font-semibold text-neutral-light uppercase tracking-[0.5px]">
              제목
            </th>
            <th className="py-2 px-2 text-left text-xs font-semibold text-neutral-light uppercase tracking-[0.5px] hidden sm:table-cell">
              근거
            </th>
            <th className="py-2 pl-2 text-right text-xs font-semibold text-neutral-light uppercase tracking-[0.5px] w-14">
              감성
            </th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post, i) => {
            const real = isRealUrl(post.url);
            return (
              <tr key={i} className="border-b border-neutral-border last:border-b-0">
                <td className="py-2 pr-2">
                  <AdTag variant={post.verdict} />
                </td>
                <td className="py-2 px-2">
                  {real ? (
                    <a
                      href={post.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block max-w-[200px] truncate font-medium text-neutral-dark hover:text-primary sm:max-w-[300px]"
                      title={post.title}
                    >
                      {post.title}
                    </a>
                  ) : (
                    <span
                      className="block max-w-[200px] truncate font-medium text-neutral-dark sm:max-w-[300px]"
                      title={post.title}
                    >
                      {post.title}
                      <span className="ml-1 text-[9px] text-neutral-light font-normal">(시뮬레이션)</span>
                    </span>
                  )}
                </td>
                <td className="py-2 px-2 hidden sm:table-cell">
                  <span className="text-neutral-mid">{post.reason || '—'}</span>
                </td>
                <td className="py-2 pl-2 text-right">
                  {post.sentiment != null ? (
                    <span
                      className={`font-medium ${
                        post.sentiment >= 0.6
                          ? 'text-score-high-text'
                          : post.sentiment >= 0.4
                          ? 'text-score-mid-text'
                          : 'text-score-low'
                      }`}
                    >
                      {(post.sentiment * 100).toFixed(0)}%
                    </span>
                  ) : (
                    <span className="text-neutral-light">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
