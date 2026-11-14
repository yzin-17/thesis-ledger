import { useState } from 'react';
import { MarketNewsSearch } from './MarketNewsSearch.js';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MarketNewsFeed } from './MarketNewsFeed.js';

export function MarketNewsSheet() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" size="sm" />}>查看新闻</SheetTrigger>
      <SheetContent size="detail">
        <SheetHeader>
          <SheetTitle>新闻与快讯</SheetTitle>
          <SheetDescription>
            个股新闻与市场快讯分别读取，展示实际来源、标题与引用链接。
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {open && (
            <Tabs defaultValue="stock">
              <TabsList aria-label="新闻类型">
                <TabsTrigger value="stock">个股新闻</TabsTrigger>
                <TabsTrigger value="feed">市场快讯</TabsTrigger>
              </TabsList>
              <TabsContent value="stock">
                <MarketNewsSearch />
              </TabsContent>
              <TabsContent value="feed">
                <MarketNewsFeed />
              </TabsContent>
            </Tabs>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
