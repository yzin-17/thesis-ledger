import {
  BadRequestException,
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  Post,
  Query,
} from '@nestjs/common';
import { MarketNewsReader } from './market-news-reader.js';
import { MarketNewsFeedReader } from './market-news-feed-reader.js';

@Controller('api/market-data')
export class MarketNewsController {
  constructor(
    @Inject(MarketNewsReader) private readonly news: MarketNewsReader,
    @Inject(MarketNewsFeedReader) private readonly feed: MarketNewsFeedReader,
  ) {}

  @Post('news')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  read(@Body() input: unknown, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException('新闻入口不接受额外查询参数');
    return this.news.read(input);
  }

  @Post('news-feed')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  readFeed(@Body() input: unknown, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException('快讯入口不接受额外查询参数');
    return this.feed.read(input);
  }
}
