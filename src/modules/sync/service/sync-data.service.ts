import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { TracingLoggerService } from '../../../logger/tracing-logger.service';
import axios, { AxiosInstance } from 'axios';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import * as cheerio from 'cheerio';
import {
  RedisSyncKey,
  SessionPrefix,
  SYNC_EVENT_FROM_ROADMAP,
  SYNC_EVENT_FROM_SCHEDULE,
  SYNC_LOCAL,
  SyncFailReason,
} from '../utils/sync.constant';
import { RedisHelper } from '../../redis/service/redis.service';
import { SessionIdSyncDto } from '../dto/sync.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { SyncEventEntity } from '../entities/sync-event.entity';
import { Repository } from 'typeorm';
import { SyncRequestDto } from '../dto/sync-request.dto';
import { UserService } from '../../user/service/user.service';
import { AuthService } from '../../../auth/auth.service';
import { RoleType } from '../../../common/user.constant';
import { UserEntity } from '../../user/entity/user.entity';
import { plainToInstance } from 'class-transformer';
import { CoursesService } from '../../courses/service/courses.service';
import { CoursesDto } from '../../courses/dto/courses.dto';
import { CourseValueService } from '../../courseValue/service/courseValue.service';
import { CourseValueDto } from '../../courseValue/dto/courseValue.dto';
import { CoursesEntity } from '../../courses/entity/courses.entity';

@Injectable()
export class SyncDataService {
  private readonly instance: AxiosInstance;
  private readonly username: string;
  private readonly password: string;

  constructor(
    private readonly logger: TracingLoggerService,
    private readonly configService: ConfigService,
    private readonly redisHelper: RedisHelper,
    @InjectRepository(SyncEventEntity)
    private readonly syncRepo: Repository<SyncEventEntity>,
    private readonly userService: UserService,
    private readonly authService: AuthService,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly courseService: CoursesService,
    private readonly courseValueService: CourseValueService,
  ) {
    this.logger.setContext(SyncDataService.name);
    this.instance = axios.create({
      baseURL: this.configService.get<string>('BASE_URL'),
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });
    this.username = this.configService.get<string>('USERNAME');
    this.password = this.configService.get<string>('PASSWORD');
  }

  async saveSessionIdToCache(sessionIdDto: SessionIdSyncDto) {
    this.logger.debug('[SYNC DATA] Save SessionId from web');
    if (sessionIdDto.sessionId.startsWith(SessionPrefix)) {
      try {
        return await this.redisHelper.set(
          RedisSyncKey,
          sessionIdDto.sessionId,
          60 * 60 * 24,
        );
      } catch (error) {
        this.logger.error('Error saving SessionId to cache', error);
        throw new InternalServerErrorException(
          'Could not save session ID to cache',
        );
      }
    }
  }

  async createSyncEvent(syncReq: SyncRequestDto) {
    const uid = await this.authService.extractUIDFromToken();
    this.logger.debug('[SYNC DATA] check user Id');
    if (!uid) {
      throw new BadRequestException('Invalid UID');
    }
    const environment = await this.configService.get('SYNC_ENV');
    const user = await this.userService.findUserWithUID(uid);
    const syncUser = await this.getSyncUser();
    syncReq.syncUser = environment === SYNC_LOCAL ? user : syncUser;
    const syncEvent = plainToInstance(SyncEventEntity, {
      syncEvent: syncReq.syncEvent,
      startTime: syncReq.startTime,
      finishTime: syncReq.finishTime,
      status: syncReq.status,
      failReason: syncReq.failReason,
      user: syncReq.syncUser,
    });
    await this.syncRepo.save(syncEvent);
    this.logger.debug('[SYNC DATA] Sync event created successfully');
  }

  async syncDataFromRoadMap() {
    const startAt = new Date();
    const checkKey = await this.redisHelper.get(RedisSyncKey);
    this.logger.debug('[SYNC DATA FROM ROAD MAP] check check key');
    const syncReq: SyncRequestDto = <SyncRequestDto>{
      syncEvent: SYNC_EVENT_FROM_ROADMAP,
      startTime: startAt,
    };
    if (!checkKey) {
      syncReq.status = false;
      syncReq.failReason = SyncFailReason.MISS_SESSION_ID;
      await this.createSyncEvent(syncReq);
      this.logger.debug('[SYNC DATA FROM ROAD MAP] missing session id');
      return;
    }
    const existCourseCodes = await this.courseService.getAllCourses();

    const response = await this.instance.get('/Default.aspx?page=ctdtkhoisv', {
      headers: {
        Cookie: checkKey,
      },
    });
    const $ = cheerio.load(response.data);
    const elements = $('[id*="lkDownload"]');
    for (let index = 0; index < elements.length; index++) {
      const element = elements[index];
      const courseName = $(element).text().trim();
      const courseCode = $(element)
        .closest('td')
        .prev()
        .find('span')
        .text()
        .trim();
      const credits = $(element)
        .closest('td')
        .next()
        .find('span')
        .text()
        .trim();

      const courseDto = plainToInstance(CoursesDto, {
        courseCode,
        name: courseName,
        credits: Number(credits),
        isNew: true,
      });
      if (existCourseCodes.includes(courseDto.courseCode)) {
        this.logger.debug(
          `[SYNC DATA FROM ROAD MAP] Course ${courseDto.courseCode} is existed`,
        );
        syncReq.status = false;
        syncReq.failReason = SyncFailReason.EXISTED_COURSE;
        syncReq.finishTime = new Date();
        await this.createSyncEvent(syncReq);
        throw new BadRequestException(
          `Course ${courseDto.courseCode} is existed`,
        );
      }
      await this.courseService.createCourse(courseDto);
      this.logger.debug(
        `[SYNC DATA FROM ROAD MAP] Successfully created course: ${courseCode}`,
      );
    }
    this.logger.debug('[SYNC DATA FROM ROAD MAP] Create sync event');
    syncReq.status = true;
    syncReq.failReason = null;
    syncReq.finishTime = new Date();
    await this.createSyncEvent(syncReq);
  }

  async syncDataFromSchedule(id: number) {
    const startAt = new Date();
    const checkKey = await this.redisHelper.get(RedisSyncKey);
    this.logger.debug('[SYNC DATA FROM SCHEDULE] Check check key');
    const syncReq: SyncRequestDto = <SyncRequestDto>{
      syncEvent: SYNC_EVENT_FROM_SCHEDULE,
      startTime: startAt,
    };
    if (!checkKey) {
      syncReq.status = false;
      syncReq.failReason = SyncFailReason.MISS_SESSION_ID;
      await this.createSyncEvent(syncReq);
      this.logger.debug('[SYNC DATA FROM SCHEDULE] missing session id');
      return;
    }
    const courses = await this.courseService.getCourses();
    const courseCodeMap = new Map<string, CoursesEntity>();

    courses.forEach((course) => {
      const baseCourseCode = course.courseCode
        .substring(0, 8)
        .trim()
        .toUpperCase();
      courseCodeMap.set(baseCourseCode, course);
    });

    const response = await this.instance.get(
      `/Default.aspx?page=thoikhoabieu&sta=0&id=${id}`,
      {
        headers: {
          Cookie: checkKey,
        },
      },
    );
    const $ = cheerio.load(response.data);
    const allCourseDetails = [];

    $('td[onmouseover^="ddrivetip"]').each((index, element) => {
      const onmouseoverAttr = $(element).attr('onmouseover');

      if (onmouseoverAttr) {
        const paramsString = onmouseoverAttr.match(/ddrivetip\((.+)\)/)?.[1];
        if (paramsString) {
          // Split the parameters and remove all single quotes
          const params = paramsString
            .split(',')
            .map((param) => param.replace(/'/g, '').trim());

          const courseCode = params[2].trim().toUpperCase(); // Extracting the course code from params

          const baseCourseCodeMatch = courseCode.match(/^([A-Z0-9]+)/);
          let baseCourseCode = baseCourseCodeMatch
            ? baseCourseCodeMatch[0].trim().toUpperCase()
            : '';
          baseCourseCode = baseCourseCode.replace(/'/g, ''); // Remove single quotes if any

          // Compare extracted course code with map
          this.logger.debug(
            `[SYNC DATA FROM SCHEDULE] Comparing extracted course code: ${baseCourseCode} against map.`,
          );
          if (!courseCodeMap.has(baseCourseCode)) {
            this.logger.debug(
              `[SYNC DATA FROM SCHEDULE] No match found for extracted course code: ${baseCourseCode}`,
            );
            return;
          }

          const course = courseCodeMap.get(baseCourseCode);
          console.log(course);
          // Extracting the necessary values from params
          const groupInfo = params[2]; // Nhóm and Lab info
          const dayOfWeek = params[3].replace(/^'|'$/g, '');
          const startPeriodStr = params[6].replace(/^'|'$/g, '');
          const location = params[5].replace(/^'|'$/g, '');
          const numberOfPeriodsStr = params[7].replace(/^'|'$/g, '');
          const lecture = params[8].replace(/^'|'$/g, '');

          // Extract group number and labGroup number

          const groupMatch = groupInfo.match(/nhóm (\d+)/i);
          const labGroupMatch = groupInfo.match(/tổ thực hành (\d+)/i);

          const startPeriod = startPeriodStr
            ? parseInt(startPeriodStr, 10)
            : null;
          const numberOfPeriods = numberOfPeriodsStr
            ? parseInt(numberOfPeriodsStr, 10)
            : null;

          const group = groupMatch ? parseInt(groupMatch[1], 10) : null;
          const labGroup = labGroupMatch
            ? parseInt(labGroupMatch[1], 10)
            : null;
          this.logger.debug('[SYNC DATA FROM SCHEDULE] Create course value');
          const courseValueDto = plainToInstance(CourseValueDto, {
            startPeriod,
            lecture,
            location,
            dayOfWeek,
            group,
            labGroup,
            numberOfPeriods,
            courses: course,
          });
          allCourseDetails.push(courseValueDto);
        }
      }
    });
    let newCourseValueCreated = false;
    this.logger.debug('[SYNC DATA FROM SCHEDULE] Check existed course value');
    for (const courseValueDto of allCourseDetails) {
      const courseExists =
        await this.courseValueService.existsCourseValue(courseValueDto);

      if (courseExists) {
        this.logger.debug('[SYNC DATA FROM SCHEDULE] Existed course value');
        continue;
      }
      await this.courseValueService.createCourseValue(courseValueDto);
      newCourseValueCreated = true;
      this.logger.debug(
        '[SYNC DATA FROM SCHEDULE] Create course value successfully',
      );
    }
    syncReq.status = newCourseValueCreated;
    syncReq.finishTime = new Date();
    syncReq.failReason = newCourseValueCreated
      ? null
      : SyncFailReason.EXISTED_COURSE_VALUE;
    await this.createSyncEvent(syncReq);
    this.logger.debug('[SYNC DATA FROM SCHEDULE] Create sync event');
    return response.data;
  }

  async getSyncUser() {
    const syncAdmin = await this.userRepo
      .createQueryBuilder('user')
      .innerJoin('user_setting_info', 'info', 'user.id=info.user_id')
      .where('info.role =:value', { value: RoleType.SYNC })
      .getOne();
    return syncAdmin;
  }
}
