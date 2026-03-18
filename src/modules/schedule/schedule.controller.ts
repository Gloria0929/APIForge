import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ScheduleService } from './schedule.service';
import { Schedule } from './schedule.entity';

@Controller('schedules')
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Get()
  getSchedules(@Query('projectId') projectId: string) {
    return this.scheduleService.getSchedules(projectId);
  }

  @Get(':id')
  getSchedule(@Param('id', ParseIntPipe) id: number) {
    return this.scheduleService.getSchedule(id);
  }

  @Post()
  createSchedule(@Body() schedule: Partial<Schedule>) {
    return this.scheduleService.createSchedule(schedule);
  }

  @Put(':id')
  updateSchedule(@Param('id', ParseIntPipe) id: number, @Body() schedule: Partial<Schedule>) {
    return this.scheduleService.updateSchedule(id, schedule);
  }

  @Post('bulk-delete')
  deleteSchedulesBatch(@Body() data: { ids: number[] }) {
    return this.scheduleService.deleteSchedulesBatch(data.ids || []);
  }

  @Delete(':id')
  deleteSchedule(@Param('id', ParseIntPipe) id: number) {
    return this.scheduleService.deleteSchedule(id);
  }
}
