import { notFound } from 'next/navigation';
import HallClient from '@/components/HallClient';
import { getHallBySlug, getMenu, getRecipes } from '@/lib/fetchers';
import { currentMealPeriod, laDate } from '@/lib/time';

export const dynamic = 'force-dynamic';

export default async function HallPage({
  params,
}: {
  params: { slug: string };
}) {
  const hall = await getHallBySlug(params.slug);
  if (!hall) notFound();

  const period = currentMealPeriod();
  const [items, recipes] = await Promise.all([
    getMenu(hall.id, laDate(), period),
    getRecipes({ hallId: hall.id, limit: 6 }),
  ]);

  return (
    <HallClient
      hall={hall}
      initialPeriod={period}
      initialItems={items}
      initialRecipes={recipes}
    />
  );
}
