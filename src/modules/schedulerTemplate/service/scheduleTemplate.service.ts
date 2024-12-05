import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { SchedulerTemplateEntity } from '../entity/schedulerTemplate.entity';
import { DataSource, Repository } from 'typeorm';
import { UserEntity } from '../../user/entity/user.entity';
import { TracingLoggerService } from '../../../logger/tracing-logger.service';
import { plainToInstance } from 'class-transformer';
import { UserService } from '../../user/service/user.service';
import { CoursePositionService } from '../../coursePosition/service/coursePosition.service';
import { CourseValueService } from '../../courseValue/service/courseValue.service';
import { CoursesService } from '../../courses/service/courses.service';
import { SchedulerTemplateDto } from '../dto/scheduler-Template.dto';
import { CreateTemplateItemDto } from '../dto/createTemplateItem.dto';
import { CoursesEntity } from '../../courses/entity/courses.entity';
@Injectable()
export class ScheduleTemplateService {
  constructor(
    @InjectRepository(SchedulerTemplateEntity)
    private readonly schedulerTemplateRepo: Repository<SchedulerTemplateEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly datasource: DataSource,
    private readonly logger: TracingLoggerService,
    private readonly userService: UserService,
    private readonly courseValueService: CourseValueService,
    private readonly coursePositonService: CoursePositionService,
    private readonly coursesService: CoursesService,
  ) {}

  async findTemplateWithId(id: number) {
    const template = await this.schedulerTemplateRepo.findOne({
      where: { id: id },
    });
    return template;
  }

  async createSchedule(schedulerTemplateDto: SchedulerTemplateDto) {
    // Find student by student ID
    const existedStudent = await this.userService.findUserWithUID(
      schedulerTemplateDto.studentId,
    );

    // The reponse template ID is null
    if (schedulerTemplateDto.templateId === null) {
      const templateDto = plainToInstance(SchedulerTemplateDto, {
        user: existedStudent,
      });
      await this.createTemplate(templateDto);
    }

    // The reponse template ID is not null
    else {
      const existedTemplate = await this.findTemplateWithId(
        schedulerTemplateDto.templateId,
      );
      if (existedTemplate !== null) {
        let existedCourse: CoursesEntity | null = null;

        for (const course of schedulerTemplateDto.listOfCourses) {
          const {
            courseID,
            courseName,
            date,
            startPeriod,
            periodsCount,
            credits,
            location,
            lecturer,
            isActive,
            isDeleted,
          } = course;
          // If we can not find any course in database with the reponse courseID => create new course => new coursePosition => new course Value
          existedCourse =
            await this.coursesService.findCourseByCourseCode(courseID);

          if (!existedCourse) {
            const courses = await this.coursesService.createCourse({
              courseCode: courseID,
              name: courseName,
              credits: credits,
              isNew: true,
            });
            const newCoursePosition =
              await this.coursePositonService.createCoursePos({
                days: date,
                periods: periodsCount,
                startPeriod: startPeriod,
                scheduler: existedTemplate,
                courses: courses,
              });
            const newCourseValue =
              await this.courseValueService.createCourseValue({
                lecture: lecturer,
                location: location,
                courses: courses,
                scheduler: existedTemplate,
              });
          }
          // If we can find one course in database with the reponse courseID => update course position
          else {
            // update course
            await this.coursesService.updateCourse({
              courseCode: courseID,
              name: courseName,
              credits: credits,
              isNew: true,
            });
            // update course position
            await this.coursePositonService.updateCoursePos({
              days: date,
              periods: periodsCount,
              startPeriod: startPeriod,
              courses: existedCourse,
              scheduler: existedTemplate,
            });
            // update course value
            await this.courseValueService.updateCourseValue({
              lecture: lecturer,
              location: location,
              courses: existedCourse,
              scheduler: existedTemplate,
            });
          }
        }
        const allCoursesDeleted = schedulerTemplateDto.listOfCourses.every(
          (course) => course.isDeleted,
        );
        // If all isDeleted variables inside the listOfCourse array is true => delete all course
        if (allCoursesDeleted) {
          await this.deleteAllCourse(
            schedulerTemplateDto,
            existedCourse,
            existedTemplate,
          );
        } else {
          await this.deleteCourse(
            schedulerTemplateDto,
            existedCourse,
            existedTemplate,
          );
        }
      }
    }
  }

  // Delete all course
  async deleteAllCourse(
    schedulerTemplateDto: SchedulerTemplateDto,
    existedCourse: CoursesEntity,
    existedTemplate: SchedulerTemplateEntity,
  ) {
    for (const course of schedulerTemplateDto.listOfCourses) {
      await this.coursePositonService.deleteCoursePos({
        days: course.date,
        periods: course.periodsCount,
        startPeriod: course.startPeriod,
        courses: existedCourse,
        scheduler: existedTemplate,
      });
      await this.courseValueService.deleteCourseValue({
        lecture: course.lecturer,
        location: course.location,
        courses: existedCourse,
        scheduler: existedTemplate,
      });
      await this.coursesService.deleteCourse({
        courseCode: course.courseID,
        name: course.courseName,
        credits: course.credits,
        isNew: true,
      });
    }
  }

  async deleteCourse(
    schedulerTemplateDto: SchedulerTemplateDto,
    existedCourse: CoursesEntity,
    existedTemplate: SchedulerTemplateEntity,
  ) {
    for (const course of schedulerTemplateDto.listOfCourses) {
      if (course.isDeleted) {
        await this.coursePositonService.deleteCoursePos({
          days: course.date,
          periods: course.periodsCount,
          startPeriod: course.startPeriod,
          courses: existedCourse,
          scheduler: existedTemplate,
        });
        await this.courseValueService.deleteCourseValue({
          lecture: course.lecturer,
          location: course.location,
          courses: existedCourse,
          scheduler: existedTemplate,
        });
        await this.coursesService.deleteCourse({
          courseCode: course.courseID,
          name: course.courseName,
          credits: course.credits,
          isNew: true,
        });
      }
    }
  }

  async createTemplate(templateDto: SchedulerTemplateDto) {
    this.logger.debug('[CREATE TEMPLATE] create template');
    const newTemplate = this.schedulerTemplateRepo.create({
      isSync: templateDto.isSynced,
      isMain: templateDto.isMainTemplate,
      lastSyncTime: templateDto.lastSyncTime,
      user: templateDto.user,
    });
    this.logger.debug('[CREATE TEMPLATE] save template successfully');
    return await this.schedulerTemplateRepo.save(newTemplate);
  }

  async getTemplate(id: number) {
    this.logger.debug('[SCHEDULE TEMPLATE] Get template`s information');
    const query =
      'SELECT scheduler_template.*, course_position.*, courses.*, course_value.* FROM scheduler_template' +
      ' LEFT JOIN course_position ON scheduler_template.scheduler_id = course_position."schedulerId"' +
      ' LEFT JOIN courses ON courses."coursePositionId" = course_position.course_position_id' +
      ' LEFT JOIN course_value ON course_value."coursesId" = courses.course_id WHERE scheduler_template.scheduler_id =' +
      ' $1';

    const schedule = await this.datasource.query(query, [id]);
    return schedule;
  }

  async getTemplateBySID(sid: string) {
    return await this.datasource
      .getRepository(SchedulerTemplateEntity)
      .createQueryBuilder('scheduler_template')
      .leftJoinAndSelect('scheduler_template.user', 'user') // join bảng 'student_users'
      .where('scheduler_template.is_main_template = true')
      .andWhere('user.studentID = :sid', { sid })
      .getOne(); // chỉ lấy 1 kết quả duy nhất (nếu có)
  }
}
