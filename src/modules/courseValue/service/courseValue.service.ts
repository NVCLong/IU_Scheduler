import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from "typeorm";
import { CourseValueEntity } from '../entity/courseValue.entity';
import { CourseValueDto } from '../dto/courseValue.dto';
import { TracingLoggerService } from '../../../logger/tracing-logger.service';

@Injectable()
export class CourseValueService {
  constructor(
    @InjectRepository(CourseValueEntity)
    private readonly courseValueRepository: Repository<CourseValueEntity>,
    private readonly logger: TracingLoggerService,
  ) {
    this.logger.setContext(CourseValueService.name);
  }

  async getAllCourseValues() {
    const response = await this.courseValueRepository.find();
    const courseValues = response.map((courseValue) => ({
      lecture: courseValue.lecture,
      location: courseValue.location,
    }));
    this.logger.debug(
      `[GET COURSE VALUES] Course value length: ${courseValues.length}`,
    );
    return courseValues;
  }

  async getCourseValue(id: number) {
    return await this.courseValueRepository.findOne({ where: { id } });
  }

  async createCourseValue(
    courseValueDto: CourseValueDto,
    entityManager?: EntityManager,
  ) {
    try {
      const manager = entityManager || this.courseValueRepository.manager;

      if (
        !courseValueDto.lecture ||
        !courseValueDto.location ||
        !courseValueDto.courses ||
        !courseValueDto.scheduler
      ) {
        throw new BadRequestException(
          'Missing required fields for CourseValue',
        );
      }

      // Tạo thực thể mới
      const newCourseValue = manager.create(CourseValueEntity, {
        lecture: courseValueDto.lecture,
        location: courseValueDto.location,
        courses: courseValueDto.courses,
        scheduler: courseValueDto.scheduler,
      });
      const savedCourseValue = await manager.save(newCourseValue);

      this.logger.debug(
        `[CREATE COURSE VALUE] Created successfully: ${JSON.stringify(
          savedCourseValue,
        )}`,
      );

      return savedCourseValue;
    } catch (error) {
      this.logger.error(
        `[CREATE COURSE VALUE] Failed to create CourseValue: ${error.message}`,
      );
      throw error;
    }
  }

  async existsCourseValue(courseValueDto: CourseValueDto) {
    const existingValue = await this.courseValueRepository.findOne({
      where: {
        courses: courseValueDto.courses,
        lecture: courseValueDto.lecture,
        location: courseValueDto.location,
        scheduler: courseValueDto.scheduler,
      },
    });
    return !!existingValue; // Returns true if a match is found
  }

  async updateCourseValue(courseValueDto: CourseValueDto) {
    const existingCourseValue = await this.courseValueRepository.findOne({
      where: {
        courses: { id: courseValueDto.courses.id },
        scheduler: { id: courseValueDto.scheduler.id },
      },
    });

    if (!existingCourseValue) {
      throw new NotFoundException('Course value not found');
    }

    existingCourseValue.lecture = courseValueDto.lecture;
    existingCourseValue.location = courseValueDto.location;

    this.logger.debug(
      `[UPDATE COURSE VALUE] update course value with course value's ID: ${existingCourseValue.id} successfully!`,
    );
    return await this.courseValueRepository.save(existingCourseValue);
  }

  async deleteCourseValue(courseValueDto: CourseValueDto): Promise<void> {
    const existingCourseValue = await this.courseValueRepository.findOne({
      where: {
        courses: { id: courseValueDto.courses.id },
        scheduler: { id: courseValueDto.scheduler.id },
      },
    });

    if (!existingCourseValue) {
      throw new NotFoundException('Course value not found');
    }

    await this.courseValueRepository.delete({
      id: existingCourseValue.id,
    });

    this.logger.debug(
      `[DELETE COURSE VALUE] Deleted course value with ID: ${existingCourseValue.id} successfully!`,
    );
  }
}
